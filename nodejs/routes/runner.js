'use strict';

const router = require('express').Router();
const {clworker, workerManager} = require('../controller/codeland');
const {getBashLine, getFileRun} = require('../lib/interpreters');

/*
	Shared by /run/structured and /:runner/run/structured: resolve a request
	body's `code`/`language`/`stdin`/`files` into the interpreter bashLine to
	hand to runnerRunStructured. Throws a 400 error if `code` is missing.
*/
function buildStructuredBashLine(body){
	const code = body.code;
	if(typeof code !== 'string' || !code.length){
		const e = new Error('code is required');
		e.status = 400; throw e;
	}

	let bashLine;
	if(body.language) bashLine = getBashLine(body.language);

	let preamble = '';
	if(Array.isArray(body.files) && body.files.length){
		for(const f of body.files){
			if(!f || typeof f.name !== 'string' || typeof f.content !== 'string') continue;
			const b64 = Buffer.from(f.content).toString('base64');
			preamble += `echo ${b64} | base64 --decode > /tmp/${f.name}; `;
		}
	}

	let fullBashLine;
	const hasStdin = typeof body.stdin === 'string' && body.stdin.length;
	if(hasStdin){
		const ext = {sh:'sh',bash:'sh',python:'py',python3:'py',javascript:'js',node:'js',
			php:'php',perl:'pl',ruby:'rb',lua:'lua',c:'c',c_ccp:'c','c++':'cpp',c_cpp:'cpp',
			rust:'rs',go:'go',golang:'go',java:'java',typescript:'ts',csharp:'cs',swift:'swift',
			r:'r',haskell:'hs',groovy:'groovy',fortran:'f'}[body.language] || 'sh';
		const fileCmd = getFileRun(body.language);
		const codeB64 = Buffer.from(code).toString('base64');
		const stdinB64 = Buffer.from(body.stdin).toString('base64');
		if(fileCmd){
			fullBashLine = `${preamble}echo ${codeB64} | base64 --decode > /tmp/code.${ext}; echo ${stdinB64} | base64 --decode | ${fileCmd}`;
		}else{
			// No file-based entry (e.g. powershell, markdown, brainfuck): write
			// the code to a script and pipe stdin into bash running it. (The
			// previous version piped stdin into `echo <code>`, which ignored
			// stdin -- echo doesn't read it -- and silently dropped it.)
			fullBashLine = `${preamble}echo ${codeB64} | base64 --decode > /tmp/code.${ext}; echo ${stdinB64} | base64 --decode | bash /tmp/code.${ext}`;
		}
	}else if(bashLine){
		fullBashLine = preamble + bashLine;
	}else{
		fullBashLine = preamble + `echo "${Buffer.from(code).toString('base64')}" | base64 --decode | bash`;
	}

	return {code, fullBashLine};
}


router.get('/', async(req, res, next)=>{
  try{
    const runners = []
  
    for(const [name, runner] of Object.entries(clworker.__runners)){
      runners.push({
        name: name,
        domain: runner.domain,
        persistent: !!runner.persistent,
        lastStatus: runner.lastStatus || '__none__',
        ...'detail' in req.query ? {
          ...(await runner.info()),
          statusHistory: runner.statusHistory
        }: undefined,
      });
    }
  
    return res.json({
      runners: runners
      });
  }catch(error){
    next(error)
  }
});

router.post('/run', async (req, res, next)=>{
  try{
    let time = Number.isInteger(Number(req.query.time)) ? req.query.time : undefined;
    let memLimit = req.query.memLimit || req.body.memLimit;
    let result = await clworker.runnerRunOnce(req.body.code, time, memLimit);
    clworker.historyAdd({runner: result.runner, duration: result.duration, ok: true});
    res.json(result);  
  }catch(error){
    clworker.historyAdd({runner: error.runner && error.runner.name, ok: false, error: error.message});
    next(error)
  }
});

/*
	Streaming run. Executes code on a fresh runner and streams the output to
	the client as it is produced (chunked). The runner is destroyed after.
*/
router.post('/run/stream', async (req, res, next)=>{
  let runner;
  try{
    const time = Number.isInteger(Number(req.body.timeout)) ? req.body.timeout : undefined;
    const queueMs = Number.isInteger(Number(req.body.queue)) ? req.body.queue : 15000;
    runner = await clworker.runnerPopWait(queueMs);
    res.setHeader('Content-Type', 'application/json');
    await clworker.runnerRunStream(runner, req.body.code, res, time);
  }catch(error){
    if(!res.headersSent) next(error);
  }finally{
    if(runner) await clworker.runnerFree(runner);
  }
});

/*
	Structured one-shot run. Accepts:
	  - code (string, required)
	  - language (string, optional): resolves to an interpreter bash_line
	  - stdin (string, optional): piped to the process
	  - files (array, optional): [{name, content}] written to /tmp before run
	  - timeout (int, optional): seconds
	  - memLimit (string|int, optional)
	Returns { runner, domain, duration, stdout, stderr, exit }.
*/
router.post('/run/structured', async (req, res, next)=>{
  try{
    const time = Number.isInteger(Number(req.body.timeout)) ? req.body.timeout : undefined;
    const memLimit = req.body.memLimit;
    // How long to wait for a runner if the oven is empty (default 15s).
    const queueMs = Number.isInteger(Number(req.body.queue)) ? req.body.queue : 15000;
    const {code, fullBashLine} = buildStructuredBashLine(req.body);

    const result = await clworker.runnerRunOnceStructured(code, time, memLimit, fullBashLine, queueMs);
    clworker.historyAdd({runner: result.runner, duration: result.duration, ok: true, exit: result.exit});
    res.json(result);
  }catch(error){
    clworker.historyAdd({runner: error.runner && error.runner.name, ok: false, error: error.message});
    next(error)
  }
});

/*
	Structured run on an existing named runner (persistent or the session's
	ephemeral "kept" runner), routed to its current worker. Unlike
	/run/structured, the runner is NOT destroyed after -- this is the
	structured counterpart to POST /:runner for the "keep this machine"
	playground mode.
*/
router.post('/:runner/run/structured', async (req, res, next)=>{
  try{
    const time = Number.isInteger(Number(req.body.timeout)) ? req.body.timeout : undefined;
    const {code, fullBashLine} = buildStructuredBashLine(req.body);

    const {worker, runner} = await workerManager.getRunnerAnywhere(req.params.runner);
    const result = await worker.runnerRunStructured(runner, code, time, fullBashLine);
    clworker.historyAdd({runner: result.runner, duration: result.duration, ok: true, exit: result.exit});
    res.json(result);
  }catch(error){
    clworker.historyAdd({runner: error.runner && error.runner.name, ok: false, error: error.message});
    next(error)
  }
});

/*
	Reserve a pooled runner without running anything on it yet. Used to start
	a "keep this machine" session: the caller gets a runner name back, then
	drives it with POST /:runner/run/structured so every run in the session
	(including the first) gets structured stdout/stderr/exit.
*/
router.post('/reserve', async (req, res, next)=>{
  try{
    const runner = clworker.runnerPop();
    return res.json({runner: runner.name, domain: runner.domain});
  }catch(error){
    next(error)
  }
});

router.post('/new', async (req, res, next)=>{
  let runner;
  try{
    runner = clworker.runnerPop();
    const result = await clworker.runnerRun(runner, req.body.code, undefined, req.body.memLimit);
    return res.json({...result, runner: runner.name});
  }catch(error){
    if(runner && !error.runner) error.runner = runner;
    next(error)
  }
});

router.post('/persistent', async (req, res, next)=>{
  let runner;
  try{
    // If no worker is specified, place on the least-loaded worker.
    const host = req.body.worker || await workerManager.pickWorkerLeastMemory();
    runner = await workerManager.runnerMakePersistent(req.body.name, req.body.memLimit, host);
    return res.json({runner: runner.name, domain: runner.domain, worker: host});
  }catch(error){
    if(runner && !error.runner) error.runner = runner;
    next(error)
  }
});

router.post('/:runner/stop', async (req, res, next)=>{
  try{
    await workerManager.runnerStopPersistent(req.params.runner);
    return res.json({res: 'stopped'});
  }catch(error){
    next(error)
  }
});

router.post('/:runner/migrate', async (req, res, next)=>{
  try{
    const target = req.body.worker;
    if(!target) throw new Error('worker is required');
    const runner = await workerManager.runnerMigrate(req.params.runner, target);
    return res.json({runner: runner.name, worker: target});
  }catch(error){
    next(error)
  }
});

router.post('/:runner/run', async (req, res, next)=>{
  try{
    const time = Number.isInteger(Number(req.query.time)) ? req.query.time : undefined;
    const result = await workerManager.runnerRunPersistent(req.params.runner, req.body.code, time);
    return res.json(result);
  }catch(error){
    next(error)
  }
});

/*
	Streaming run on a persistent runner, routed to its current worker.
*/
router.post('/:runner/run/stream', async (req, res, next)=>{
  try{
    const time = Number.isInteger(Number(req.body.timeout)) ? req.body.timeout : undefined;
    res.setHeader('Content-Type', 'application/json');
    await workerManager.runnerRunStreamAnywhere(req.params.runner, req.body.code, res, time);
  }catch(error){
    if(!res.headersSent) next(error);
  }
});

/*
	Streaming run on any named runner (persistent or ephemeral), routed to its
	current worker.
*/
router.post('/:runner/stream', async (req, res, next)=>{
  try{
    const time = Number.isInteger(Number(req.body.timeout)) ? req.body.timeout : undefined;
    res.setHeader('Content-Type', 'application/json');
    await workerManager.runnerRunStreamAnywhere(req.params.runner, req.body.code, res, time);
  }catch(error){
    if(!res.headersSent) next(error);
  }
});

router.get('/registry', async (req, res, next)=>{
  try{
    const {initOrm} = require('../lib/orm');
    const models = await initOrm();
    const runners = await models.Runner.list();
    return res.json({runners: runners.map(r => r.toJSON())});
  }catch(error){
    next(error)
  }
});

router.post('/:runner', async (req, res, next)=>{
  try{
    const time = Number.isInteger(Number(req.query.time)) ? req.query.time : undefined;
    const result = await workerManager.runnerRunAnywhere(req.params.runner, req.body.code, time);
    return res.json({...result, runner: req.params.runner});
  }catch(error){
    next(error)
  }
});

/*
	File operations on a runner. These must be defined before the /:runner
	catch-all routes so the /files path isn't swallowed.
*/
router.get('/:runner/files', async (req, res, next)=>{
  try{
    const {worker, runner} = await workerManager.getRunnerAnywhere(req.params.runner);
    const dir = req.query.dir || '/tmp';
    const files = await runner.listFiles(dir);
    return res.json({runner: runner.name, dir, files});
  }catch(error){
    next(error)
  }
});

router.get('/:runner/files/content', async (req, res, next)=>{
  try{
    const {worker, runner} = await workerManager.getRunnerAnywhere(req.params.runner);
    const path = req.query.path;
    if(!path) throw Object.assign(new Error('path is required'), {status: 400});
    const content = await runner.readFile(path);
    return res.json({runner: runner.name, path, content});
  }catch(error){
    next(error)
  }
});

router.post('/:runner/files', async (req, res, next)=>{
  try{
    const {worker, runner} = await workerManager.getRunnerAnywhere(req.params.runner);
    const {path, content} = req.body;
    if(!path || typeof content !== 'string') throw Object.assign(new Error('path and content are required'), {status: 400});
    await runner.writeFile(path, content);
    return res.json({runner: runner.name, path, res: 'written'});
  }catch(error){
    next(error)
  }
});

router.delete('/:runner/files', async (req, res, next)=>{
  try{
    const {worker, runner} = await workerManager.getRunnerAnywhere(req.params.runner);
    const path = req.query.path;
    if(!path) throw Object.assign(new Error('path is required'), {status: 400});
    await runner.deleteFile(path);
    return res.json({runner: runner.name, path, res: 'deleted'});
  }catch(error){
    next(error)
  }
});

router.post('/:runner/files/rename', async (req, res, next)=>{
  try{
    const {worker, runner} = await workerManager.getRunnerAnywhere(req.params.runner);
    const {from, to} = req.body;
    if(!from || !to) throw Object.assign(new Error('from and to are required'), {status: 400});
    await runner.renameFile(from, to);
    return res.json({runner: runner.name, from, to, res: 'renamed'});
  }catch(error){
    next(error)
  }
});

router.post('/:runner/files/mkdir', async (req, res, next)=>{
  try{
    const {worker, runner} = await workerManager.getRunnerAnywhere(req.params.runner);
    const {path} = req.body;
    if(!path) throw Object.assign(new Error('path is required'), {status: 400});
    await runner.makeDir(path);
    return res.json({runner: runner.name, path, res: 'created'});
  }catch(error){
    next(error)
  }
});

router.get('/:runner', async (req, res, next)=>{
  try{
    const info = await workerManager.runnerInfoAnywhere(req.params.runner);
    return res.json(info);
  }catch(error){
    next(error)
  }
});

router.delete('/:runner', async (req, res, next)=>{
  try{
    await workerManager.runnerFreeAnywhere(req.params.runner);
    return res.json({res: 'success'});
  }catch(error){
    next(error)
  }
});

module.exports = router;
