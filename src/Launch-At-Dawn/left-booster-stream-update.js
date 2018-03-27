'use strict';

const stepRunner = require('./step-runner');
const { spaceCenter } = require('krpc-node');
const displayMessage = require('./steps/display-message');
const setBoosterThrust = require('./steps/set-booster-thrust');
const delay = require('./conditions/delay');
const returnFunctionOptions = { _fn: true };
const checkBelow = require('./conditions/check-below');
const coreField = 'leftCore';
const displayName = 'Left Core';
const altitudeField = coreField + 'Altitude';
const controlPoint = 'SpaceX Falcon 9 Flight Control System';

let stepQueue = [
    setControllingPart,
    setBoosterAutoPilotReturnTrajectory,
    setBoosterThrust(0.05, coreField),
    {
        action: [
            displayMessage(`${displayName} Boostback Start`, 3),
            setBoosterThrust(0.7, coreField)
        ],
        condition: delay(32, 'seconds') //rk todo replace this with an altitude check
    },
    {
        action: [displayMessage(`${displayName} Boostback end`, 3), setBoosterThrust(0, coreField)],
        condition: delay(14.8, 'seconds')
    },
    prepForReentry,
    { action: setBoosterThrust(0.16, coreField), condition: checkBelow(altitudeField, 630) },
    { action: deployLandingGear, condition: checkBelow(altitudeField, 500) },
    { action: setBoosterThrust(0, coreField), condition: delay(7.8, 'seconds') },
    { action: done, condition: delay(10, 'seconds') }
];

module.exports = function(client, state) {
    return stepRunner.runSteps(`${displayName}BoosterSteps`, stepQueue, client, state);
};

async function setControllingPart({ state, client }) {
    let { falcon9Heavy } = state;
    const core = falcon9Heavy[coreField];
    let probe = await core.parts.withTitle(controlPoint);
    probe = probe[0];
    await client.send(spaceCenter.partsSetControlling(core.parts.id, probe.id));
}

async function setBoosterAutoPilotReturnTrajectory({ state }) {
    let { falcon9Heavy } = state;
    const core = falcon9Heavy[coreField];
    await core.autoPilot.engage();
    await core.autoPilot.targetPitchAndHeading(0, 269.665);
    await core.control.rcs.set(true);
}

async function prepForReentry({ state, client }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy[coreField].autoPilot.disengage();
    await falcon9Heavy[coreField].control.sas.set(true);
    await falcon9Heavy[coreField].control.speedMode.set('Surface');
    await falcon9Heavy[coreField].control.sasMode.set('Retrograde');
    await falcon9Heavy[coreField].control.brakes.set(true);
    let getAltitudeCall = await falcon9Heavy[coreField].flight.surfaceAltitude.get(
        returnFunctionOptions
    );
    await client.addStream(getAltitudeCall, altitudeField);
}

async function deployLandingGear({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy[coreField].control.gear.set(true);
    await falcon9Heavy[coreField].control.sasMode.set('StabilityAssist');
}

async function done({ client }) {
    console.log('closing');
    await client.close();
    console.log('Done!');
    // eslint-disable-next-line no-process-exit
    process.exit(0);
}
