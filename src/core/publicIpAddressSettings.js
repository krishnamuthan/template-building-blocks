'use strict';

let _ = require('lodash');
let v = require('./validation');
let r = require('./resources');

const PUBLICIPADDRESS_SETTINGS_DEFAULTS = {
    publicIPAllocationMethod: 'Dynamic',
    publicIPAddressVersion: 'IPv4'
};

let validIPAllocationMethods = ['Dynamic', 'Static'];
let validIPAddressVersion = ['IPv4', 'IPv6'];

let isValidIPAllocationMethod = (ipAllocationMethod) => {
    return v.utilities.isStringInArray(ipAllocationMethod, validIPAllocationMethods);
};

let isValidIPAddressVersion = (ipAddressVersion) => {
    return v.utilities.isStringInArray(ipAddressVersion, validIPAddressVersion);
};

let publicIpAddressValidations = {
    name: v.validationUtilities.isNotNullOrWhitespace,
    subscriptionId: v.validationUtilities.isGuid,
    resourceGroupName: v.validationUtilities.isNotNullOrWhitespace,
    publicIPAllocationMethod: (value) => {
        return {
            result: isValidIPAllocationMethod(value),
            message: `Valid values are ${validIPAllocationMethods.join(',')}`
        };
    },
    publicIPAddressVersion: (value) => {
        return {
            result: isValidIPAddressVersion(value),
            message: `Valid values are ${validIPAddressVersion.join(',')}`
        };
    },
    idleTimeoutInMinutes: (value) => {
        return {
            result: (_.isUndefined(value) || (_.isFinite(value)))
        };
    },
    domainNameLabel: (value) => {
        return _.isUndefined(value) ? {
            result: true
        } : {
            validations: v.validationUtilities.isNotNullOrWhitespace
        };
    },
    reverseFqdn: (value, parent) => {
        return _.isUndefined(value) ? {
            result: true
        } : (parent.publicIPAddressVersion === 'IPv6') ? {
            result: false,
            message: 'reverseFqdn cannot be set if publicIPAddressVersion is IPv6'
        } : {
            validations: v.validationUtilities.isNotNullOrWhitespace
        };
    }
};

function transform(settings) {
    let result = {
        name: settings.name,
        id: r.resourceId(settings.subscriptionId, settings.resourceGroupName, 'Microsoft.Network/publicIPAddresses', settings.name),
        resourceGroupName: settings.resourceGroupName,
        subscriptionId: settings.subscriptionId,
        location: settings.location,
        properties: {
            publicIPAllocationMethod: settings.publicIPAllocationMethod,
            publicIPAddressVersion: settings.publicIPAddressVersion
        }
    };

    if (settings.idleTimeoutInMinutes) {
        result.properties.idleTimeoutInMinutes = settings.idleTimeoutInMinutes;
    }

    if ((settings.domainNameLabel) || (settings.reverseFqdn)) {
        result.properties.dnsSettings = {};
        if (settings.domainNameLabel) {
            result.properties.dnsSettings.domainNameLabel = settings.domainNameLabel;
        }

        if (settings.reverseFqdn) {
            result.properties.dnsSettings.reverseFqdn = settings.reverseFqdn;
        }
    }

    return result;
}

let merge = ({ settings, buildingBlockSettings, defaultSettings }) => {
    let defaults = (defaultSettings) ? [PUBLICIPADDRESS_SETTINGS_DEFAULTS, defaultSettings] : PUBLICIPADDRESS_SETTINGS_DEFAULTS;

    let merged = v.merge(settings, defaults);
    return merged;
};

let validate = (settings) => {
    let errors = v.validate({
        settings: settings,
        validations: publicIpAddressValidations
    });

    return errors;
};

exports.transform = function (settings) {
    let results = (_.isArray(settings)) ? _.map(settings, (setting) => { return transform(setting); }) : transform(settings);

    return {
        publicIpAddresses: results
    };
};

function process ({ settings, buildingBlockSettings, defaultSettings }) {
    settings = _.castArray(settings);

    let buildingBlockErrors = v.validate({
        settings: buildingBlockSettings,
        validations: {
            subscriptionId: v.validationUtilities.isGuid,
            resourceGroupName: v.validationUtilities.isNotNullOrWhitespace,
        }
    });

    if (buildingBlockErrors.length > 0) {
        throw new Error(JSON.stringify(buildingBlockErrors));
    }

    let results = merge({
        settings: settings,
        buildingBlockSettings: buildingBlockSettings,
        defaultSettings: defaultSettings
    });

    let errors = validate(results);

    if (errors.length > 0) {
        throw new Error(JSON.stringify(errors));
    }

    results = _.transform(results, (result, setting) => {
        result.publicIpAddresses.push(transform(setting));
    }, {
        publicIpAddresses: []
    });

    let resourceGroups = r.extractResourceGroups(
        results.publicIpAddresses
    );
    return {
        resourceGroups: resourceGroups,
        parameters: results
    };
}

exports.process = process;
exports.merge = merge;
exports.validations = publicIpAddressValidations;