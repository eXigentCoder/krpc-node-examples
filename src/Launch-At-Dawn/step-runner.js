'use strict';
let _ = require('lodash');
let moment = require('moment');

module.exports = { runSteps, percentageToTarget };

function runSteps(name, steps, client, state) {
    let stepQueue = _.reverse(steps);
    stepQueue = stepQueue.map(mapStep);
    let step = stepQueue.pop();
    let nextLogTimer = new Date();
    let logInterval = {
        value: 1,
        period: 'seconds'
    };
    return async function(streamUpdate) {
        if (shouldSkip(step)) {
            return;
        }
        const actionName = step.action.name;
        if (step.condition) {
            const result = step.condition(streamUpdate);
            if (!result.shouldRun) {
                return logProgressToCondition(actionName, result.percentage);
            }
        }
        console.log(`[${name}] :About to run ${actionName}`);
        step.processing = true;
        try {
            await step.action({ streamUpdate, client, state, step });
        } catch (err) {
            console.error(`[${name}] :Error on ${actionName}\n${err.message}\n${err.stack}`);
            step.done = true;
            await client.close();
            // eslint-disable-next-line no-process-exit
            process.exit(-1);
        }
        step.done = true;
        console.log(`[${name}] :Done with ${actionName}`);
        step = stepQueue.pop();
    };

    function logProgressToCondition(actionName, percentageToTarget) {
        if (moment.utc().isAfter(nextLogTimer)) {
            console.log(`[${name}] :${actionName} waiting ${percentageToTarget}`);
            incrementNextLogTimer();
        }
    }

    function incrementNextLogTimer() {
        nextLogTimer = moment.utc().add(logInterval.value, logInterval.period);
    }
}

function mapStep(step) {
    if (typeof step === 'function') {
        return wrapFnStep(step);
    }
    if (typeof step !== 'object') {
        throw new Error(`Unknown step type :${typeof step}`);
    }
    if (!step.action) {
        throw new Error('Step.action must be set to a function but was null');
    }
    if (typeof step.action !== 'function') {
        throw new Error(`Step.action must be a function but was a ${typeof step.condition}`);
    }
    if (!step.condition) {
        return wrapFnStep(step.action);
    }
    if (typeof step.condition !== 'function') {
        throw new Error(`step.condition must be a function but was a ${typeof step.condition}`);
    }
    return wrapFnStep(step.action, step.condition);
}

function wrapFnStep(action, condition) {
    return {
        processing: false,
        done: false,
        action: action,
        condition
    };
}

function shouldSkip(step) {
    return !step || step.done || step.processing;
}

function percentageToTarget(target, current) {
    const percentage = (current / target * 100).toFixed(2);
    return `${percentage} %`;
}
