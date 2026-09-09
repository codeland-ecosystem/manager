'use strict';

const ps = require('./pubsub.js'); 
const {Ssh, CodeLandWorker} = require('../lib/codeland');
const {WorkerManager} = require('../lib/worker_manager');
const conf = require('../conf')

const ssh = new Ssh(conf.ssh);

class CodelandController extends CodeLandWorker{
  constructor(...args){
    super(...args)
  }

  history = [];

  historyAdd = function(add){

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
  await clworker.runnerOven(10*1000);

  clworker.__log('df', (await clworker.ssh.df())['/'])



})()

module.exports = {ssh, clworker, workerManager};
