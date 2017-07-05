'use strict';
const async = require('async');
const Client = require('krpc-node');
const moment = require('moment');
let client = null;
let state = {
    clientId: null,
    vessel: {
        id: null,
        controlId: null,
        surfaceReference: null,
        surfaceFlightId: null
    }
};
let logInterval = {
    period: 'seconds',
    value: 1
};
let nextLogTimer = null;

Client(null, clientCreated);

/*
Equation:
 F (force) = m (mass) * a (acceleration)
The force (F) or engine thrust required to hover should equal the mass of the vessel (m) * the acceleration exerted upon it from gravity (a)
*/

function clientCreated(err, createdClient) {
    if (err) {
        throw err;
    }
    client = createdClient;
    async.series(
        [
            getInitalInfo,
            connectToStreamServer,
            getVesselInfo,
            getVesselFlight,
            addPitchToStream,
            addRollToStream,
            addHeadingToStream,
            addSurfaceAltitudeToStream,
            addSpeedToStream,
            addThrottleToStream,
            addThrustToStream,
            addMassToStream,
            turnSasOn,
            turnRcsOn
        ],
        function(err) {
            if (err) {
                throw err;
            }
            client.stream.on('message', streamUpdate);
            incrementNextLogTimer();
        }
    );
}

function getFirstResult(response) {
    return getResultN(response, 0);
}

function getResultN(response, n) {
    if (response.error) {
        throw response.error;
    }
    let result = response.results[n];
    if (result.error) {
        throw result.error;
    }
    return result.value;
}

function getInitalInfo(callback) {
    let calls = [
        client.services.krpc.getClientId(),
        client.services.spaceCenter.getActiveVessel(),
        client.services.spaceCenter.getBodies()
    ];
    client.send(calls, function(err, response) {
        if (err) {
            return callback(err);
        }
        state.clientId = getResultN(response, 0).toString('base64');
        state.vessel = {
            id: getResultN(response, 1)
        };
        state.celestialBodies = getResultN(response, 2);
        return callback();
    });
}

function connectToStreamServer(callback) {
    client.connectToStreamServer(state.clientId, function(err) {
        return callback(err);
    });
}

function getVesselInfo(callback) {
    let calls = [
        client.services.spaceCenter.vesselGetControl(state.vessel.id),
        client.services.spaceCenter.vesselGetSurfaceReferenceFrame(state.vessel.id),
        client.services.spaceCenter.vesselGetAutoPilot(state.vessel.id),
        client.services.spaceCenter.celestialBodyGetSurfaceGravity(state.celestialBodies['Kerbin'])
    ];
    client.send(calls, function(err, response) {
        if (err) {
            return callback(err);
        }
        state.vessel.controlId = getFirstResult(response);
        state.vessel.surfaceReference = getResultN(response, 1);
        state.vessel.autoPilot = getResultN(response, 2);
        state.surfaceGravity = getResultN(response, 3);
        return callback();
    });
}

function getVesselFlight(callback) {
    const call = client.services.spaceCenter.vesselFlight(
        state.vessel.id,
        state.vessel.surfaceReference
    );
    client.send(call, function(err, response) {
        if (err) {
            return callback(err);
        }
        state.vessel.surfaceFlightId = getFirstResult(response);
        return callback();
    });
}

function addPitchToStream(callback) {
    let call = client.services.spaceCenter.flightGetPitch(state.vessel.surfaceFlightId);
    client.addStream(call, 'pitch', callback);
}

function addRollToStream(callback) {
    let call = client.services.spaceCenter.flightGetRoll(state.vessel.surfaceFlightId);
    client.addStream(call, 'roll', callback);
}

function addHeadingToStream(callback) {
    let call = client.services.spaceCenter.flightGetHeading(state.vessel.surfaceFlightId);
    client.addStream(call, 'heading', callback);
}

function addSurfaceAltitudeToStream(callback) {
    let call = client.services.spaceCenter.flightGetSurfaceAltitude(state.vessel.surfaceFlightId);
    client.addStream(call, 'altitude', callback);
}

function addSpeedToStream(callback) {
    let call = client.services.spaceCenter.flightGetTrueAirSpeed(state.vessel.surfaceFlightId);
    client.addStream(call, 'speed', callback);
}

function addThrottleToStream(callback) {
    let call = client.services.spaceCenter.controlGetThrottle(state.vessel.controlId);
    client.addStream(call, 'throttle', callback);
}

function addThrustToStream(callback) {
    let call = client.services.spaceCenter.vesselGetMaxThrust(state.vessel.id);
    client.addStream(call, 'maxThrust', callback);
}

function addMassToStream(callback) {
    let getSpeed = client.services.spaceCenter.vesselGetMass(state.vessel.id);
    client.addStream(getSpeed, 'mass', callback);
}

function streamUpdate(streamState) {
    if (moment.utc().isAfter(nextLogTimer)) {
        console.log(streamState);
        incrementNextLogTimer();
    }
}

function incrementNextLogTimer() {
    nextLogTimer = moment.utc().add(logInterval.value, logInterval.period);
}

function turnSasOn(callback) {
    let getSpeed = client.services.spaceCenter.controlSetSas(state.vessel.controlId, true);
    client.send(getSpeed, callback);
}

function turnRcsOn(callback) {
    let getSpeed = client.services.spaceCenter.controlSetRcs(state.vessel.controlId, true);
    client.send(getSpeed, callback);
}
