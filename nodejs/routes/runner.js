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
