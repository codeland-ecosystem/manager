const axios = require('axios');


axios.post('https://192.168.1.32:8006/api2/json/nodes/pve1/qemu/109/status/reboot',{
	Authorization: 'PVEAPIToken=ajones@pam!fixparsec=a25f93b4-6160-4513-9b5e-9dda06ebc787'
	})
	.then(function (response) {
		console.log(response);
	})
	.catch(function (error) {
		console.log(error);
	});