/**
 * Calendar month arithmetic without JS Date overflow (e.g. Aug 31 + 1 month → Oct 1).
 * Simulations anchor on the 1st of each month.
 */

/**
 * @param {Date} date
 * @param {number} months
 * @returns {Date}
 */
function addCalendarMonths(date, months) {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    d.setMonth(d.getMonth() + months);
    return d;
}

/**
 * First simulated replenishment month: 1st day of the calendar month after startDate.
 * @param {Date} startDate
 * @returns {Date}
 */
function firstScheduleMonthAfterStart(startDate) {
    return addCalendarMonths(startDate, 1);
}

module.exports = {
    addCalendarMonths,
    firstScheduleMonthAfterStart,
};
