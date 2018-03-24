'use strict';

// const setEngineClusterThrust = require('./set-engine-cluster-thrust');
// const modelBuilder = require('./model-builder');
const stepRunner = require('./step-runner');
// const returnFunctionOptions = { _fn: true };
// const { ui } = require('krpc-node');
// const moment = require('moment');
const displayMessage = require('./steps/display-message');
const delay = require('./conditions/delay');
const fireEngines = require('./utilities/fire-engines');

let stepQueue = [
    displayMessage('Hello from the booster stream updater thing.', 3),
    //setBoosterRetrograde,
    setBoosterAutoPilot,
    { action: accelerateBoostBackBurn(0.2), condition: delay(9.5, 'seconds') },
    displayMessage('Boostback Start', 3),
    { action: accelerateBoostBackBurn(0.4), condition: delay(4, 'seconds') },
    { action: accelerateBoostBackBurn(1), condition: delay(2, 'seconds') },
    { action: setBoosterSasModeToStability, condition: delay(7, 'seconds') }
];

module.exports = function(client, state) {
    return stepRunner.runSteps('BoosterSteps', stepQueue, client, state);
};

async function setBoosterRetrograde({ state }) {
    let { falcon9Heavy } = state;
    await setSasRetrograde(falcon9Heavy.leftCore);
    await setSasRetrograde(falcon9Heavy.rightCore);
}

async function setSasRetrograde(core) {
    await core.autoPilot.disengage();
    await core.control.rcs.set(true);
    await core.control.sas.set(true);
    await core.control.sasMode.set('Retrograde');
}

async function setBoosterAutoPilot({ state }) {
    let { falcon9Heavy } = state;
    await setBoosterAutoPilotPitchAndHeading(falcon9Heavy.leftCore);
    await setBoosterAutoPilotPitchAndHeading(falcon9Heavy.rightCore);
}

async function setBoosterAutoPilotPitchAndHeading(core) {
    await core.autoPilot.engage();
    await core.autoPilot.targetPitchAndHeading(0, 270);
    await core.control.rcs.set(true);
}

function accelerateBoostBackBurn(throttle) {
    return async function _accelerateBoostBackBurn({ state, client }) {
        let { falcon9Heavy } = state;
        await fireEngines(falcon9Heavy.leftCore, client, throttle);
        await fireEngines(falcon9Heavy.rightCore, client, throttle);
    };
}

async function setBoosterSasModeToStability({ state }) {
    let { falcon9Heavy } = state;
    await falcon9Heavy.leftCore.control.sasMode.set('StabilityAssist');
    await falcon9Heavy.rightCore.control.sasMode.set('StabilityAssist');
}
