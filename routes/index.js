var express = require('express');
var router = express.Router();
var {Ssh, CodeLandWorker} = require('../lib/codeland');


let ssh = new Ssh({
  host:'192.168.1.171',
  user:'virt',
  keyPath:'~/.ssh/id_rsa_cl-worker'
});

var clworker;

(async function(){
  clworker = await CodeLandWorker.new({
    ssh: ssh,
    memTarget: 40,
    minAvailableRunners: 10
  })
  await clworker.deleteUntracedRunners();
  await clworker.runnerFill();
})()


/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/run', async function(req, res, next){

  res.json(await clworker.runnerRunOnce(req.body.code));
});

module.exports = router;
