"use strict";

const { fillArray } = require("./utils");

/**
 * Takes an array of true/false values where true means on and false means off.
 * Evaluates of the on/off sequences are valid according to other arguments.
 *
 * @param {*} onOff Array of on/off values
 * @param {*} maxMinutesOff Max number of minutes that can be off in a sequence
 * @param {*} minMinutesOff Min number of minutes that must be off to bother
 * @param {*} recoveryPercentage Percent of off-time that must be on after being off
 * @param {*} recoveryMaxMinutes Maximum recovery time in minutes
 * @returns
 */
function isOnOffSequencesOk(
  onOff,
  maxMinutesOff,
  minMinutesOff,
  recoveryPercentage,
  recoveryMaxMinutes = null) {
  let offCount = 0;
  let onCount = 0;
  let reachedMaxOff = false;
  let reachedMinOn = true;
  let reachedMinOff = null;
  let minOnAfterOff = 0;
  for (let i = 0; i < onOff.length; i++) {
    if (!onOff[i]) {
      if (maxMinutesOff === 0 || reachedMaxOff) {
        return false;
      }
      if(!reachedMinOn) {
        return false;
      }
      if(reachedMinOff === null) {
        reachedMinOff = false;
      }
      offCount++;
      onCount = 0;
      if (offCount >= maxMinutesOff) {
        reachedMaxOff = true;
      }
      if (offCount >= minMinutesOff) {
        reachedMinOff = true;
      }
      const minRounded = Math.max(Math.round(offCount * recoveryPercentage / 100), 1)
      const recMaxMin = recoveryMaxMinutes === "" ? null : recoveryMaxMinutes;
      minOnAfterOff = Math.min(minRounded, recMaxMin ?? minRounded)
      if(i === onOff.length - 1) {
        // If last minute, consider min reached
        reachedMinOn = true;
        reachedMinOff = true;
      }
    } else {
      if(reachedMinOff === false) {
        return false;
      }
      onCount++;
      if (onCount >= minOnAfterOff) {
        reachedMaxOff = false;
        reachedMinOn = true;
      } else {
        reachedMinOn = false;
      }
      offCount = 0;
      reachedMinOff = null;
    }
  }
  return reachedMinOn && !(reachedMinOff === false);
}

/**
 * Turn off the minutes where you save most compared to the next minute on.
 *
 * @param {*} values Array of prices
 * @param {*} maxMinutesOff Max number of minutes that can be saved in a row
 * @param {*} minMinutesOff Min number of minutes to turn off in a row
 * @param {*} recoveryPercentage Min percent of time off that must be on after being off
 * @param {*} recoveryMaxMinutes Maximum recovery time in minutes
 * @param {*} minSaving Minimum amount that must be saved in order to turn off
 * @param {*} lastValueDayBefore Value of the last minute the day before
 * @param {*} lastCountDayBefore Number of lastValueDayBefore in a row
 * @returns Array with same number of values as in values array, where true is on, false is off
 */

function calculate(
  values,
  maxMinutesOff,
  minMinutesOff,
  recoveryPercentage,
  recoveryMaxMinutes,
  minSaving,
  lastValueDayBefore = undefined,
  lastCountDayBefore = 0
) {
  const dayBefore = fillArray(lastValueDayBefore, lastCountDayBefore);
  const n = values.length;
  const last = n - 1;

  // Edge case: no values or maxMinutesOff is 0
  if (n === 0 || maxMinutesOff === 0) {
    return values.map(() => true);
  }

  // Limit maxMinutesOff to what's meaningful for the data
  const effectiveMaxOff = Math.min(maxMinutesOff, last);

  // Build list of candidate off-sequences with their savings
  // A sequence starting at minute m with count c turns off slots [m, m+count)
  // and turns on at slot m+count (or stays off if at end)
  const candidates = [];

  for (let minute = 0; minute < last; minute++) {
    // Only consider counts from minMinutesOff to effectiveMaxOff
    for (let count = minMinutesOff; count <= effectiveMaxOff; count++) {
      // Sequence would occupy [minute, minute+count)
      // Cannot extend beyond last (need at least one slot after for "on")
      if (minute + count > last) break;

      // Calculate total saving for this sequence
      // Saving = sum of (price[i] - price[turnOnSlot]) for each slot i in [minute, minute+count)
      const turnOnSlot = minute + count;
      const turnOnPrice = values[turnOnSlot];
      let saving = 0;

      for (let i = minute; i < minute + count; i++) {
        saving += values[i] - turnOnPrice;
      }

      // Check minimum saving criteria
      if (saving > minSaving * count && values[minute] > turnOnPrice + minSaving) {
        candidates.push({ minute, count, saving });
      }
    }
  }

  // Sort by saving descending, then by count ascending (prefer shorter sequences if equal saving)
  candidates.sort((a, b) => b.saving === a.saving ? a.count - b.count : b.saving - a.saving);

  // Track which slots are taken
  const taken = new Array(n).fill(false);

  // Greedy selection
  for (const candidate of candidates) {
    const { minute, count } = candidate;

    // Check if any slot in this range is already taken
    let canUse = true;
    for (let i = minute; i < minute + count; i++) {
      if (taken[i]) {
        canUse = false;
        break;
      }
    }

    if (!canUse) continue;

    // Check if adding this sequence would violate constraints
    // We use the original validation function for correctness, but only when we're actually
    // considering adding a new sequence (not for every iteration through the list)
    const testOnOff = taken.map(t => !t); // Convert taken to onOff (taken=off, !taken=on)
    for (let i = minute; i < minute + count; i++) {
      testOnOff[i] = false;
    }

    if (isOnOffSequencesOk([...dayBefore, ...testOnOff], maxMinutesOff, minMinutesOff, recoveryPercentage, recoveryMaxMinutes)) {
      // Accept this sequence
      for (let i = minute; i < minute + count; i++) {
        taken[i] = true;
      }
    }
  }

  // Convert taken array to onOff result
  return taken.map(t => !t);
}

module.exports = { calculate, isOnOffSequencesOk };
