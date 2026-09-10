'use strict';

const ps = require('./pubsub.js'); 
const {Ssh, CodeLandWorker} = require('../lib/codeland');
const {WorkerManager} = require('../lib/worker_manager');
const conf = require('../conf')

const ssh = new Ssh(conf.ssh);

class CodelandController extends CodeLandWorker{
  constructor(...args){
    super(...args)
    // Ring buffer of recent job executions: {when, runner, duration, ok}.
    this.history = [];
    this.historyMax = 100;
  }

  historyAdd(entry){
    this.history.push({
      when: new Date().getTime(),
      ...entry,
    });
    if(this.history.length > this.historyMax){
      this.history.splice(0, this.history.length - this.historyMax);
    }
  }

  __log(topic, message){
    topic = `cl:worker:${topic}`; 
    super.__log(topic, message);

    if(message.error){
      let error = message.error;
      message.error = `${error.name} -- ${error.message}`
    }

    ps.publish(topic , message);
  }


}

const clworker = new CodelandController({ssh, ...conf.clworker});

// Multi-worker manager for persistent runners. Each worker host is registered
// here so persistent runners can be routed and migrated between workers.
const workerManager = new WorkerManager({
  sshConfig: conf.ssh,
  clworkerConfig: conf.clworker,
});

// Register the primary worker.
workerManager.addWorker(conf.ssh.host);

// Register any additional workers from config.
for(const host of (conf.workers || [])){
  workerManager.addWorker(host);
}


(async function(){
  await clworker.init();
  setInterval(async (clworker)=>{
    try{
      clworker.__log('memory', await clworker.ssh.memory())
    }catch{}
  }, 2000, clworker)
  await clworker.deleteUntrackedRunners();
  // Periodically sweep untracked runners so leaked container dirs from failed
  // cooks (or crashes) don't accumulate indefinitely.
  setInterval(async (clworker)=>{
    try{
      await clworker.deleteUntrackedRunners();
    }catch(error){
      console.error('untracked sweep error:', error);
    }
  }, 5*60*1000, clworker);
  // Rehydrate persistent runners from the registry so they are usable again
  // after a manager restart (the in-memory __runners map is empty on boot).
  try{
    await workerManager.rehydrate();
  }catch(error){
    console.error('rehydrate error:', error);
  }
  await clworker.runnerOven(10*1000);

  clworker.__log('df', (await clworker.ssh.df())['/'])



})()

module.exports = {ssh, clworker, workerManager};
