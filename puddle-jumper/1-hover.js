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

function clientCreated(err, createdClient) {
    if (err) {
        throw err;
    }
    client = createdClient;
    async.series(
        [
            getInitialInfo,
            connectToStreamServer,
            getVesselInfo,
            getVesselFlight,
            turnSasOn,
            turnRcsOn,
            addPitchToStream,
            addRollToStream,
            addHeadingToStream,
            addSurfaceAltitudeToStream,
            addSpeedToStream,
            addThrottleToStream,
            addThrustToStream,
            addMassToStream,
            addVelocityToStream,
            setThrottleToMax,
            launch
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

function getInitialInfo(callback) {
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
    const kerbin = state.celestialBodies['Kerbin'];
    let calls = [
        client.services.spaceCenter.vesselGetControl(state.vessel.id),
        client.services.spaceCenter.vesselGetSurfaceReferenceFrame(state.vessel.id),
        client.services.spaceCenter.vesselGetAutoPilot(state.vessel.id),
        client.services.spaceCenter.celestialBodyGetSurfaceGravity(kerbin),
        client.services.spaceCenter.celestialBodyGetEquatorialRadius(kerbin)
    ];
    client.send(calls, function(err, response) {
        if (err) {
            return callback(err);
        }
        state.vessel.controlId = getFirstResult(response);
        state.vessel.surfaceReference = getResultN(response, 1);
        state.vessel.autoPilot = getResultN(response, 2);
        state.surfaceGravity = getResultN(response, 3);
        state.equatorialRadius = getResultN(response, 4);
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

function addVelocityToStream(callback) {
    let getSpeed = client.services.spaceCenter.vesselVelocity(
        state.vessel.id,
        state.vessel.surfaceReference
    );
    client.addStream(getSpeed, 'velocity', callback);
}

function streamUpdate(streamState) {
    executeHoverLoop(streamState);
    logStreamStateIfRequired(streamState);
}

function logStreamStateIfRequired(streamState) {
    if (moment.utc().isAfter(nextLogTimer)) {
        console.log(JSON.stringify(streamState, null, 4));
        incrementNextLogTimer();
    }
}

function incrementNextLogTimer() {
    nextLogTimer = moment.utc().add(logInterval.value, logInterval.period);
}

function turnSasOn(callback) {
    let call = client.services.spaceCenter.controlSetSas(state.vessel.controlId, true);
    client.send(call, callback);
}

function turnRcsOn(callback) {
    let call = client.services.spaceCenter.controlSetRcs(state.vessel.controlId, true);
    client.send(call, callback);
}

function setThrottleToMax(callback) {
    let call = client.services.spaceCenter.controlSetThrottle(state.vessel.controlId, 1);
    client.send(call, callback);
}

function launch(callback) {
    let call = client.services.spaceCenter.controlActivateNextStage(state.vessel.controlId);
    client.send(call, callback);
}

/*
 Equation:
 F (force) = m (mass) * a (acceleration)
 The force (F) or engine thrust required to hover should equal the mass of the vessel (m) * the acceleration exerted upon it from gravity (a)
 */
function executeHoverLoop(streamState) {
    if (streamState.altitude < 200) {
        return;
    }
    if (streamState.speed > 0) {
        if (streamState.throttle > 0) {
            client.send(client.services.spaceCenter.controlSetThrottle(state.vessel.controlId, 0));
        }
        return;
    }
    //https://www.mansfieldct.org/Schools/MMS/staff/hand/lawsgravaltitude.htm
    const gravityAtThisAltitude =
        state.surfaceGravity /
        ((state.equatorialRadius + streamState.altitude) / state.equatorialRadius);
    const forceNeededToCancelGravity = streamState.mass * gravityAtThisAltitude;
    let forceNeededToCancelSpeed = 0;
    if (streamState.speed < 0) {
        //we are falling, so canceling out gravity alone isn't enough
        forceNeededToCancelSpeed = streamState.mass * Math.abs(streamState.speed);
    }
    const forceNeeded = forceNeededToCancelGravity + forceNeededToCancelSpeed;
    let newThrottleValue = streamState.maxThrust / forceNeeded;
    if (newThrottleValue > 1) {
        newThrottleValue = 1;
    }
    if (newThrottleValue <= 0) {
        return;
    }
    client.send(
        client.services.spaceCenter.controlSetThrottle(state.vessel.controlId, newThrottleValue)
    );
}
