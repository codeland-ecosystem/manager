const {PubSub} = require('p2psub');

ps = new PubSub();

console.log(ps.subscribe())

module.exports = ps;
