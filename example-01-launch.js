'use strict';
require('./init');
let util = require('util');
let Client = require('krpc-node');
let client = Client();
var game = {};
client.on('open', function (event) {
    client.on('message', getActiveVesselComplete);
    client.send(client.services.spaceCenter.getActiveVessel());
});

client.on('error', function (err) {
    console.log(util.format('Error : %j', err));
    process.exit(1);
});

client.on('close', function (event) {
    console.log(util.format('Connection Closed : %j', event));
    process.exit(1);
});

function getActiveVesselComplete(response) {
    game.vessel = {
        id: getFirstResult(response)
    };
    replaceMessageHandler(getActiveVesselControlComplete);
    client.send(client.services.spaceCenter.vesselGetControl(game.vessel.id));
}

function getActiveVesselControlComplete(response) {
    game.vessel.control = {
        id: getFirstResult(response)
    };
    replaceMessageHandler(getThrottleValueComplete);
    client.send(client.services.spaceCenter.controlGetThrottle(game.vessel.control.id));
}

function getThrottleValueComplete(response) {
    game.vessel.control.throttle = getFirstResult(response);
    console.log(util.format("Updating throttle value from %s to 1", game.vessel.control.throttle));
    replaceMessageHandler(setThrottleToFullComplete);
    var call = client.services.spaceCenter.controlSetThrottle(game.vessel.control.id, 1);
    client.send(call);
}

function setThrottleToFullComplete(response) {
    replaceMessageHandler(launched);
    client.send(client.services.spaceCenter.controlActivateNextStage(game.vessel.control.id));
}

function launched(response) {
    var vesselId = getFirstResult(response);
    expect(vesselId).to.be.ok();
    process.exit(0);
}

function getFirstResult(response) {
    expect(response.error).to.not.be.ok();
    expect(response.results.length).to.equal(1);
    var result = response.results[0];
    expect(result.error).to.not.be.ok();
    return result.value;
}

function replaceMessageHandler(fn) {
    client.emitter.removeAllListeners('message');
    client.on('message', fn);
}