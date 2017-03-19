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
    async.waterfall([
        getClientIdAndActiveVessel,
        connectToStreamServer,
        getVesselControl,
        getVesselGetSurfaceReferenceFrame,
        getVesselFlight,
        // addPitchToStream,
        // addRollToStream,
        // addHeadingToStream,
        //addSurfaceAltitudeToStream,
        addRotationToStream,
        // addDirectionToStream
    ], function (err) {
        if (err) {
            throw err;
        }
        client.stream.on('message', streamUpdate);
        incrementNextLogTimer();
    });
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

function getClientIdAndActiveVessel(callback) {
    let calls = [
        client.services.krpc.getClientId(),
        client.services.spaceCenter.getActiveVessel()
    ];
    client.send(calls, function (err, response) {
        if (err) {
            return callback(err);
        }
        state.clientId = getResultN(response, 0).toString('base64');
        state.vessel = {
            id: getResultN(response, 1)
        };
        return callback();
    });
}

function connectToStreamServer(callback) {
    client.connectToStreamServer(state.clientId, function (err) {
        return callback(err);
    });
}

function getVesselControl(callback) {
    client.send(client.services.spaceCenter.vesselGetControl(state.vessel.id), function (err, response) {
        if (err) {
            return callback(err);
        }
        state.vessel.controlId = getFirstResult(response);
        return callback();
    });
}

function getVesselGetSurfaceReferenceFrame(callback) {
    client.send(client.services.spaceCenter.vesselGetSurfaceReferenceFrame(state.vessel.id), function (err, response) {
        if (err) {
            return callback(err);
        }
        state.vessel.surfaceReference = getFirstResult(response);
        return callback();
    });
}

function getVesselFlight(callback) {
    client.send(client.services.spaceCenter.vesselFlight(state.vessel.id, state.vessel.surfaceReference), function (err, response) {
        if (err) {
            return callback(err);
        }
        state.vessel.surfaceFlightId = getFirstResult(response);
        return callback();
    });
}

function addPitchToStream(callback) {
    let getThrottle = client.services.spaceCenter.flightGetPitch(state.vessel.surfaceFlightId);
    client.addStream(getThrottle, "Pitch", throttleStreamAdded);
    function throttleStreamAdded(err) {
        return callback(err);
    }
}

function addRollToStream(callback) {
    let getThrottle = client.services.spaceCenter.flightGetRoll(state.vessel.surfaceFlightId);
    client.addStream(getThrottle, "Roll", throttleStreamAdded);
    function throttleStreamAdded(err) {
        return callback(err);
    }
}

function addHeadingToStream(callback) {
    let getHeading = client.services.spaceCenter.flightGetHeading(state.vessel.surfaceFlightId);
    client.addStream(getHeading, "Heading", throttleStreamAdded);
    function throttleStreamAdded(err) {
        return callback(err);
    }
}

function addSurfaceAltitudeToStream(callback) {
    let getThrottle = client.services.spaceCenter.flightGetSurfaceAltitude(state.vessel.surfaceFlightId);
    client.addStream(getThrottle, "Altitude", throttleStreamAdded);
    function throttleStreamAdded(err) {
        return callback(err);
    }
}

function addRotationToStream(callback) {
    let getThrottle = client.services.spaceCenter.flightGetRotation(state.vessel.surfaceFlightId);
    client.addStream(getThrottle, "Rotation", throttleStreamAdded);
    function throttleStreamAdded(err) {
        return callback(err);
    }
}

function addDirectionToStream(callback) {
    let getThrottle = client.services.spaceCenter.flightGetDirection(state.vessel.surfaceFlightId);
    client.addStream(getThrottle, "Direction", throttleStreamAdded);
    function throttleStreamAdded(err) {
        return callback(err);
    }
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