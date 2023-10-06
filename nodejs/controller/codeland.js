'use strict';

const ps = require('./pubsub.js'); 
const {Ssh, CodeLandWorker} = require('../lib/codeland');
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
    ps.publish(topic , message);
    super.__log(topic, message);
  }
}

const clworker = new CodelandController({ssh, ...conf.clworker});


(async function(){
  await clworker.init();
  clworker.__log('memory', await clworker.ssh.memory())
  clworker.__log('df', (await clworker.ssh.df())['/'])
  await clworker.deleteUntracedRunners();
  await clworker.runnerFill();

  setInterval(async (clworker)=>{
    clworker.__log('memory', await clworker.ssh.memory())
    clworker.__log('df', (await clworker.ssh.df())['/'])
  }, 10*1000, clworker)

  // setInterval(async (clworker)=>{
  //   clworker.runnerFill()
  // }, 30*1000, clworker)

})()















module.exports = {ssh, clworker};
