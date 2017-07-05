'use strict';
const async = require('async');
const Client = require('krpc-node');
const moment = require('moment');
let Controller = require('node-pid-controller');

let client = null;
let state = {
    clientId: null,
    vessel: {
        id: null,
        controlId: null,
        surfaceReference: null,
        surfaceFlightId: null
    },
    lastAltitude: 0,
    landed: false,
    shutdownInitiated: false
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
            getVesselInfo1,
            getVesselInfo2,
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
            addResourcesToStream,
            setThrottleToMax,
            launch,
            pointALittleToTheEast
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

function getVesselInfo1(callback) {
    const kerbin = state.celestialBodies['Kerbin'];
    let calls = [
        client.services.spaceCenter.vesselGetControl(state.vessel.id),
        client.services.spaceCenter.vesselGetSurfaceReferenceFrame(state.vessel.id),
        client.services.spaceCenter.vesselGetAutoPilot(state.vessel.id),
        client.services.spaceCenter.celestialBodyGetSurfaceGravity(kerbin),
        client.services.spaceCenter.celestialBodyGetEquatorialRadius(kerbin),
        client.services.spaceCenter.vesselGetResources(state.vessel.id)
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
        state.vessel.resourceId = getResultN(response, 5);
        return callback();
    });
}

function getVesselInfo2(callback) {
    const calls = [
        client.services.spaceCenter.vesselFlight(state.vessel.id, state.vessel.surfaceReference),
        client.services.spaceCenter.resourcesGetNames(state.vessel.resourceId)
    ];
    client.send(calls, function(err, response) {
        if (err) {
            return callback(err);
        }
        state.vessel.surfaceFlightId = getFirstResult(response);
        state.vessel.resources = getResultN(response, 1);
        return callback();
    });
}

function addPitchToStream(callback) {
    const call = client.services.spaceCenter.flightGetPitch(state.vessel.surfaceFlightId);
    client.addStream(call, 'pitch', callback);
}

function addRollToStream(callback) {
    const call = client.services.spaceCenter.flightGetRoll(state.vessel.surfaceFlightId);
    client.addStream(call, 'roll', callback);
}

function addHeadingToStream(callback) {
    const call = client.services.spaceCenter.flightGetHeading(state.vessel.surfaceFlightId);
    client.addStream(call, 'heading', callback);
}

function addSurfaceAltitudeToStream(callback) {
    const call = client.services.spaceCenter.flightGetSurfaceAltitude(state.vessel.surfaceFlightId);
    client.addStream(call, 'altitude', callback);
}

function addSpeedToStream(callback) {
    const call = client.services.spaceCenter.flightGetTrueAirSpeed(state.vessel.surfaceFlightId);
    client.addStream(call, 'speed', callback);
}

function addThrottleToStream(callback) {
    const call = client.services.spaceCenter.controlGetThrottle(state.vessel.controlId);
    client.addStream(call, 'throttle', callback);
}

function addThrustToStream(callback) {
    const call = client.services.spaceCenter.vesselGetMaxThrust(state.vessel.id);
    client.addStream(call, 'maxThrust', callback);
}

function addMassToStream(callback) {
    const call = client.services.spaceCenter.vesselGetMass(state.vessel.id);
    client.addStream(call, 'mass', callback);
}
function addResourcesToStream(callback) {
    const liquidFuelName = state.vessel.resources.items.find(name => /liquidfuel/i.test(name));
    const call = client.services.spaceCenter.resourcesAmount(
        state.vessel.resourceId,
        liquidFuelName
    );
    client.addStream(call, 'fuel', callback);
}

function streamUpdate(streamState) {
    if (!state.landed) {
        executeHoverLoop(streamState);
    } else {
        shutdownProcedure(streamState);
    }
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

function pointALittleToTheEast(callback) {
    let call = client.services.spaceCenter.controlSetRight(state.vessel.controlId, 0.1);
    client.send(call, callback);
}

let pidOn = false;

// k_p, k_i, k_d, dt (see https://www.npmjs.com/package/node-pid-controller)
/*
 https://en.wikipedia.org/wiki/PID_controller
 P accounts for present values of the error. For example, if the error is large and positive,
 the control output will also be large and positive.
 I accounts for past values of the error. For example, if the current output is not sufficiently strong,
 the integral of the error will accumulate over time, and the controller will respond by applying a stronger action.
 D accounts for possible future trends of the error, based on its current rate of change.[2].
 For example, continuing the P example above, when the large positive control output succeeds in bringing the error
 closer to zero, it also puts the process on a path to large negative error in the near future; in this case,
 the derivative turns negative and the D module reduces the strength of the action to prevent this overshot.
 */
let ctr = new Controller(0.05, 0.006, 0.002, 0.05); //Default: 0.25, 0.01, 0.01, 1
let targetSpeed = 0;
let breaksDeployed = false;
ctr.setTarget(targetSpeed);
function executeHoverLoop(streamState) {
    updateSpeedSign(streamState);
    if (streamState.altitude < 200 && !pidOn) {
        return;
    }
    if (streamState.speed > 0 && !pidOn) {
        pidOn = true;
        client.send([
            client.services.spaceCenter.controlSetThrottle(state.vessel.controlId, 0),
            client.services.spaceCenter.controlSetRight(state.vessel.controlId, -0.1)
        ]);
        return;
    }
    if (streamState.speed <= 0 && !breaksDeployed) {
        breaksDeployed = true;
        client.send([
            client.services.spaceCenter.controlSetBrakes(state.vessel.controlId, true),
            client.services.spaceCenter.controlSetRight(state.vessel.controlId, 0)
        ]);
    }
    if (streamState.fuel < 317 && targetSpeed === 0) {
        targetSpeed = -25;
        ctr.setTarget(targetSpeed);
        client.send(client.services.spaceCenter.controlSetGear(state.vessel.controlId, true));
    }
    if (streamState.altitude < 40 && targetSpeed !== -6) {
        targetSpeed = -6;
        ctr.setTarget(targetSpeed);
        client.send(client.services.spaceCenter.controlSetGear(state.vessel.controlId, true));
    }
    let correction = ctr.update(streamState.speed);

    if (streamState.altitude < 5) {
        state.landed = true;
        correction = 0;
    }
    client.send(client.services.spaceCenter.controlSetThrottle(state.vessel.controlId, correction));
}

function updateSpeedSign(streamState) {
    streamState.lastAltitude = state.lastAltitude;
    //temp fix for velocities not being returned, need to know if we falling or ascending.
    if (state.lastAltitude > streamState.altitude) {
        streamState.speed = -1 * streamState.speed;
    }
    state.lastAltitude = streamState.altitude;
}

function shutdownProcedure(streamState) {
    if (!state.shutdownInitiated) {
        state.shutdownInitiated = true;
        setTimeout(function() {
            client.send([
                client.services.spaceCenter.controlSetBrakes(state.vessel.controlId, false),
                client.services.spaceCenter.controlSetGear(state.vessel.controlId, false),
                client.services.spaceCenter.autoPilotEngage(state.vessel.autoPilot),
                client.services.spaceCenter.autoPilotTargetPitchAndHeading(state.vessel.autoPilot, 2, 270),
                client.services.spaceCenter.controlSetThrottle(state.vessel.controlId, 1)
            ]);
        }, 3000);
    }
}
