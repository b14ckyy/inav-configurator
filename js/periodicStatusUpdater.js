'use strict';

import GUI from './gui';
import FC from './fc';
import CONFIGURATOR from './data_storage';
import MSP from './msp';
import MSPCodes from './msp/MSPCodes';
import mspQueue from './serial_queue';

 var periodicStatusUpdater = (function () {

    var publicScope = {},
        privateScope = {};

    var stoppped = false;

    // Status requests are sent one per tick (round-robin) instead of all at once,
    // so settings downloads can interleave between polls instead of waiting behind a burst.
    privateScope.pollMessages = [
        MSPCodes.MSP_SENSOR_STATUS,
        MSPCodes.MSPV2_INAV_STATUS,
        MSPCodes.MSP_ACTIVEBOXES,
        MSPCodes.MSPV2_INAV_ANALOG,
    ];
    privateScope.pollIndex = 0;

    /**
     *
     * @param {number=} baudSpeed
     * @returns {number}
     */
    publicScope.getUpdateInterval = function (baudSpeed) {

        if (!baudSpeed) {
            baudSpeed = 115200;
        }

        if (baudSpeed >= 115200) {
            return 300;
        } else if (baudSpeed >= 57600) {
            return 600;
        } else if (baudSpeed >= 38400) {
            return 800;
        } else {
            return 1000;
        }
    };

    // Time to refresh all status messages once. Wireless links (hard lock) are
    // polled slower to leave more bandwidth for settings downloads.
    publicScope.getPollCycle = function () {
        if (mspQueue.getLockMethod() === 'hard') {
            return 1000;
        }
        return publicScope.getUpdateInterval(CONFIGURATOR.connection ? CONFIGURATOR.connection.bitrate : undefined);
    };

    // Per-tick interval: one status message per tick, spread evenly across the cycle.
    publicScope.getPollInterval = function () {
        return Math.round(publicScope.getPollCycle() / privateScope.pollMessages.length);
    };

    privateScope.updateView = function () {

        var active = ((Date.now() - MSP.analog_last_received_timestamp) < publicScope.getPollCycle() * 3);

        if (FC.isModeEnabled('ARM')) {
            $("#armedIcon").removeClass('armed');
            $("#armedIcon").addClass('armed-active');
        } else {
            $("#armedIcon").removeClass('armed-active');
            $("#armedIcon").addClass('armed');
        }
        if (FC.isModeEnabled('FAILSAFE')) {
            $("#failsafeicon").removeClass('failsafe');
            $("#failsafeicon").addClass('failsafe-active');
        } else {
            $("#failsafeicon").removeClass('failsafe-active');
            $("#failsafeicon").addClass('failsafe');
        }

        if (FC.ANALOG != undefined) {
            var nbCells;

            nbCells = FC.ANALOG.cell_count;
            var min = FC.MISC.vbatmincellvoltage * nbCells;
            var max = FC.MISC.vbatmaxcellvoltage * nbCells;
            var warn = FC.MISC.vbatwarningcellvoltage * nbCells;

            $(".battery-status").css({
                width: FC.ANALOG.battery_percentage + "%",
                display: 'inline-block'
            });
        
            if (active) {
                $("#linkicon").removeClass('link');
                $("#linkicon").addClass('link-active');
            } else {
                $("#linkicon").removeClass('link-active');
                $("#linkicon").addClass('link');
            }

            if (((FC.ANALOG.use_capacity_thresholds && FC.ANALOG.battery_remaining_capacity <= FC.MISC.battery_capacity_warning - FC.MISC.battery_capacity_critical) || (!FC.ANALOG.use_capacity_thresholds && FC.ANALOG.voltage < warn)) || FC.ANALOG.voltage < min) {
                $(".battery-status").css('background-color', '#D42133');
            } else {
                $(".battery-status").css('background-color', '#59AA29');
            }

            $(".battery-legend").text(FC.ANALOG.voltage + " V");
        }

        $('#quad-status_wrapper').show();
    };

    publicScope.run = function () {

        if (!CONFIGURATOR.connectionValid) {
            return;
        }

        $(".quad-status-contents").css({
            display: 'inline-block'
        });

        if (stoppped || CONFIGURATOR.cliActive) {
            return;
        }

        MSP.send_message(privateScope.pollMessages[privateScope.pollIndex], false, false);
        privateScope.pollIndex++;

        if (privateScope.pollIndex >= privateScope.pollMessages.length) {
            privateScope.pollIndex = 0;
            privateScope.updateView();
        }
    };

    publicScope.stop = function() {
        stoppped = true;
    }

    publicScope.resume = function() {
        stoppped = false;
    }

    return publicScope;
})();

export default periodicStatusUpdater;
