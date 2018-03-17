'use strict';
const returnFunctionOptions = { _fn: true };

module.exports = async function setEngineClusterThrust(cluster, thrustPercentage) {
    const promises = [];
    cluster.forEach(function(engine) {
        promises.push(engine.thrustLimit.set(returnFunctionOptions, thrustPercentage));
    });
    return await Promise.all(promises);
};
