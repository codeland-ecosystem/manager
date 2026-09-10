'use strict';

const router = require('express').Router();
const {clworker, workerManager} = require('../controller/codeland');


router.get('/', async(req, res, next)=>{
  try{
    const runners = []
  
    for(const [name, runner] of Object.entries(clworker.__runners)){
      runners.push({
        name: name,
        domain: runner.domain,
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
    const {getBashLine} = require('../lib/interpreters');
    const time = Number.isInteger(Number(req.body.timeout)) ? req.body.timeout : undefined;
    const memLimit = req.body.memLimit;
    const code = req.body.code;
    if(typeof code !== 'string' || !code.length){
      const e = new Error('code is required');
      e.status = 400; throw e;
    }

    // Resolve the interpreter template.
    let bashLine;
    if(req.body.language){
      bashLine = getBashLine(req.body.language);
    }

    // Build a preamble that writes any files.
    let preamble = '';
    if(Array.isArray(req.body.files) && req.body.files.length){
      for(const f of req.body.files){
        if(!f || typeof f.name !== 'string' || typeof f.content !== 'string') continue;
        const b64 = Buffer.from(f.content).toString('base64');
        preamble += `echo ${b64} | base64 --decode > /tmp/${f.name}; `;
      }
    }

    // If stdin is provided, write the code to a file and run it file-based
    // (the interpreter templates pipe code via stdin, which would conflict
    // with user stdin). Otherwise use the interpreter template.
    let fullBashLine;
    const hasStdin = typeof req.body.stdin === 'string' && req.body.stdin.length;
    if(hasStdin){
      const {getFileRun} = require('../lib/interpreters');
      const ext = {sh:'sh',bash:'sh',python:'py',python3:'py',javascript:'js',node:'js',
        php:'php',perl:'pl',ruby:'rb',lua:'lua',c:'c',c_ccp:'c','c++':'cpp',c_cpp:'cpp',
        rust:'rs',go:'go',golang:'go',java:'java',typescript:'ts',csharp:'cs',swift:'swift',
        r:'r',haskell:'hs',groovy:'groovy',fortran:'f'}[req.body.language] || 'sh';
      const fileCmd = getFileRun(req.body.language);
      if(fileCmd){
        const codeB64 = Buffer.from(code).toString('base64');
        const stdinB64 = Buffer.from(req.body.stdin).toString('base64');
        fullBashLine = `${preamble}echo ${codeB64} | base64 --decode > /tmp/code.${ext}; echo ${stdinB64} | base64 --decode | ${fileCmd}`;
      }else{
        // No file-based entry; fall back to shell with stdin.
        const codeB64 = Buffer.from(code).toString('base64');
        const stdinB64 = Buffer.from(req.body.stdin).toString('base64');
        fullBashLine = `${preamble}echo ${stdinB64} | base64 --decode | echo ${codeB64} | base64 --decode | bash`;
      }
    }else if(bashLine){
      fullBashLine = preamble + bashLine;
    }else{
      fullBashLine = preamble + `echo "${Buffer.from(code).toString('base64')}" | base64 --decode | bash`;
    }

    const result = await clworker.runnerRunOnceStructured(code, time, memLimit, fullBashLine);
    clworker.historyAdd({runner: result.runner, duration: result.duration, ok: true, exit: result.exit});
    res.json(result);
  }catch(error){
    clworker.historyAdd({runner: error.runner && error.runner.name, ok: false, error: error.message});
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
    const host = req.body.worker || clworker.ssh.host;
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
