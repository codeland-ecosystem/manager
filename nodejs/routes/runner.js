'use strict';

const router = require('express').Router();
const {clworker} = require('../controller/codeland');



router.get('/', async(req, res, next)=>{
  try{
    const runners = []
  
    for(const [name, runner] of Object.entries(clworker.__runners)){
      runners.push({
        name: name,
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
    let result = await clworker.runnerRunOnce(req.body.code, time);
    res.json(result);  
  }catch(error){
    next(error)
  }
});

router.post('/new', async (req, res, next)=>{
  let runner;
  try{
    runner = clworker.runnerPop();
    const result = await clworker.runnerRun(runner, req.body.code);
    return res.json({...result, runner: runner.name});
  }catch(error){
    if(runner && !error.runner) error.runner = runner;
    next(error)
  }
});

router.post('/:runner', async (req, res, next)=>{
  let runner;
  try{
    runner = clworker.runnerGetByName(req.params.runner);
    const result = await clworker.runnerRun(runner, req.body.code, false);
    return res.json({...result, runner: runner.name});
  }catch(error){
    if(runner && !error.runner) error.runner = runner;
    next(error)
  }
});

router.get('/:runner', async (req, res, next)=>{
  let runner;
  try{
    runner = clworker.runnerGetByName(req.params.runner);

    console.log({
      ...(await runner.info()),
      lastStatus: runner.lastStatus,
      statusHistory: runner.statusHistory,
    })


    return res.json({
      ...(await runner.info()),
      lastStatus: runner.lastStatus,
      statusHistory: runner.statusHistory,
    });
  }catch(error){
    if(runner && !error.runner) error.runner = runner;
    next(error)
  }
});

router.delete('/:runner', async (req, res, next)=>{
  let runner;
  try{
    runner = clworker.runnerGetByName(req.params.runner);
    await clworker.runnerFree(runner);
    return res.json({res: 'success'});
  }catch(error){
    if(runner && !error.runner) error.runner = runner;
    next(error)
  }
});

module.exports = router;


const interpreters = {
    'bash': 'echo "${code_in_base64}" | base64 --decode | bash',
    'python': 'echo "${code_in_base64}" | base64 --decode | python3',
    'javascript': 'echo "${code_in_base64}" | base64 --decode | node',
    'c': 'echo "${code_in_base64}" | base64 --decode | gcc -xc -o run1 - && ./run1',
    'php': 'echo "${code_in_base64}" | base64 --decode | php',
    'ruby': 'echo "${code_in_base64}" | base64 --decode | ruby',
    'go': 'echo "${code_in_base64}" | base64 --decode | go run',
    'rust': 'echo "${code_in_base64}" | base64 --decode | rustc -o run1 - && ./run1',
    'lua': 'echo "${code_in_base64}" | base64 --decode | lua',
    'java': 'echo "${code_in_base64}" | base64 --decode | java',
    'haskell': 'echo "${code_in_base64}" | base64 --decode | runhaskell',
    'lolcode': 'echo "${code_in_base64}" | base64 --decode | lci', // LOLCODE interpreter
    'brainfuck': 'echo "${code_in_base64}" | base64 --decode | bf', // Brainfuck interpreter
    'perl': 'echo "${code_in_base64}" | base64 --decode | perl',
    'csharp': 'echo "${code_in_base64}" | base64 --decode | mono',
    'typescript': 'echo "${code_in_base64}" | base64 --decode | ts-node',
    'scala': 'echo "${code_in_base64}" | base64 --decode | scala',
    'kotlin': 'echo "${code_in_base64}" | base64 --decode | kotlinc -include-runtime -d run1.jar && java -jar run1.jar',
    'swift': 'echo "${code_in_base64}" | base64 --decode | swift',
    'r': 'echo "${code_in_base64}" | base64 --decode | Rscript',
    'powershell': 'echo "${code_in_base64}" | base64 --decode | powershell', // PowerShell interpreter
    'ejs': 'echo "${code_in_base64}" | base64 --decode | ejs', // EJS templating language
    'pug': 'echo "${code_in_base64}" | base64 --decode | pug', // Pug templating language
    'handlebars': 'echo "${code_in_base64}" | base64 --decode | handlebars', // Handlebars templating language
    'mustache': 'echo "${code_in_base64}" | base64 --decode | mustache',
    'md': 'echo "${code_in_base64}" | base64 --decode | pandoc -f markdown -t html', // Markdown interpreter to convert to HTML
    'solidity': 'echo "${code_in_base64}" | base64 --decode | solc --bin --abi -o . --overwrite'
}

// <service/port>.<runner>.<worker>.<location>.codeland.us

// curl -X POST https://718it.codeland.us/api/v1/runner -H "Content-Type: application/json" -d '{"code": "echo \"console.log(\'Hello, Codeland!\');\" | node" }'

// curl -X POST http://localhost:3000/api/v1/runner -H "Content-Type: application/json" -d '{"code": "echo \" hello\"  " }'