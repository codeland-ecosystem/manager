'use strict';

class CLTerminal extends Terminal{
	constructor(element, addons){
		super();
		this.passedElement = element;
		this.addonMap = {};

		this.pushAddons('FitAddon', 'WebglAddon');
		this.open()

		$(window).resize(()=>{
		  this.fit()
		});
	}

	open(element){
		element = element || this.passedElement;
		super.open(element);
		this.fit()
		return this;
	}

	fit(argument) {
		this.addonMap.FitAddon.fit()
		return this;
	}

	pushAddons(...addons) {
		for(const addon of addons){
			if (this.addonMap[addon] || !addon) continue;

			this.addonMap[addon] = new window[addon][addon]();  // Remove the extra dot.
			this.loadAddon(this.addonMap[addon]);
		}
	}
}


class CLTerminalWs extends CLTerminal{
	constructor(element, wsURL){
		super(element)
		this.textEncoder = new TextEncoder({encoding: "utf-8"})
		this.socket = new WebSocket(wsURL, ['tty']);

		this.termListeners()
		this.socketListeners()
	}

	termListeners (){
		this.onKey((event)=>{
			this.socket.send(this.textEncoder.encode(0+event.key))
		});

		this.onResize((data)=>{
			this.socket.send(this.textEncoder.encode(1+JSON.stringify(data)))
		});
	}

	socketListeners(){
		this.socket.onmessage = async (event)=>{
			let messageType = await event.data.slice(0,1).text();
			let body = await event.data.slice(1,event.data.length).text();
				// 0 term line
				// 1 term title
				// 2 term options object
			if(messageType === "0") return this.write(body)


			// todo... do something with #2
		}

		this.socket.onopen = (event)=>{
			console.log("[ttyd] websocket connection opened");
			const message = JSON.stringify({
			    AuthToken: this.token || '',
			    columns: this.cols,
			    rows: this.rows
			});

			if (this.socket) {
			    this.socket.send(this.textEncoder.encode(message));
			}

			if (this.opened) {
			    this.reset();
			    this.options.disableStdin = false;
			} else {
			    this.opened = true;
			}

			this.focus();
		}
	}
}
