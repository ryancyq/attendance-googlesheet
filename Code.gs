function onInstall(e) {
  onOpen(e);

  // Perform additional setup as needed.
}

function onOpen(e) {
  var ui = SpreadsheetApp.getUi();
  var menu = ui.createAddonMenu();
  var props = readConfig();

  if (e && e.authMode == ScriptApp.AuthMode.NONE || !props.isInitialized) {
    menu.addItem('Create New', 'showCreateNewSidebar');
    menu.addItem('Create With ...', 'showCreateFromExistingSidebar');
  } else {
    menu.addItem('Refresh', 'refresh');
    menu.addItem('Purge', 'purge');
    menu.addSeparator();
    menu.addItem('Options', 'showEditSidebar');
  }
  menu.addToUi();
}

/**
 * Opens a sidebar. The sidebar structure is described in the CreateNewSidebar.html
 * project file.
 */
function showCreateNewSidebar() {
  var ui = HtmlService.createTemplateFromFile('CreateNewSidebar')
    .evaluate()
    .setTitle('Create New');
  SpreadsheetApp.getUi().showSidebar(ui);
}

/**
 * Create new roster sheet
 *
 * @param {String} sheetname - required.
 * @param {String} frequency. Frequency of the inverval - required.
 * @param {String} daysDisplay. Number of days to display per interval - required.
 * @param {String} showNext. To show upcoming interval - required.
 * @param {Array} daysInWeek. The days in a week for weekly/monthly frequency
 * @param {String} customSheetname. The sheet name of custom range.
 * @param {String} customRange. The A1 notion of the data rows.
 */
function createNew(sheetname, frequency, daysDisplay, showNext, daysInWeek, customSheetname, customRange) {

  if (!sheetname) {
    throw "Invalid sheet name, " + sheetname;
  }

  if (!isValidFrequency(frequency)) {
    throw "Invalid frequency, " + frequency;
  }

  if (!daysDisplay) {
    throw "Invalid days to display, " + daysDisplay;
  }
  daysDisplay = normalizeDaysDisplay(daysDisplay)

  var newSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetname);
  if (newSheet != null) {
    throw "A sheet with name '" + sheetname + "' existed. Please use another name.";
  }

  switch (frequency) {
    case 'd':
      {
        newSheet = SpreadsheetApp.getActive().insertSheet(sheetname);
        newSheet.getRange(1, 1).setValue("Name");

        try {
          // configure timetable headers
          var headersRange = newSheet.getRange(1, 2, 1, daysDisplay).getA1Notation();
          var dates = getDatesForDaily(daysDisplay);
          updateTimetableHeaders(newSheet.getSheetName(), headersRange, dates);
        } catch (e) {
          SpreadsheetApp.getActive().deleteSheet(newSheet);
          throw e;
        }
        break;
      }
    case 'w':
      {
        if (!isValidDaysInWeek(daysInWeek)) {
          throw "Invalid days for weekly frequency.";
        }

        newSheet = SpreadsheetApp.getActive().insertSheet(sheetname);
        newSheet.getRange(1, 1).setValue("Name");

        try {
          // configure timetable headers
          var headersRange = newSheet.getRange(1, 2, 1, daysDisplay).getA1Notation();
          var dates = getDatesForWeekly(daysDisplay, daysInWeek);
          updateTimetableHeaders(newSheet.getSheetName(), headersRange, dates);
        } catch (e) {
          SpreadsheetApp.getActive().deleteSheet(newSheet);
          throw e;
        }
        break;
      }
    case 'm':
      {
        if (!isValidDaysInWeek(daysInWeek)) {
          throw "Invalid days for monthly frequency.";
        }
        break;
      }
    case 'c':
      {
        if (!isValidRange(customSheetname, customRange)) {
          throw "Invalid custom frequency, sheet:[" + customSheetName + "] range:[" + customRange + "]";
        };
        break;
      }
  }

  createFromExisting();
}

/**
 * Helper function to populate dates for daily frequency
 */
function getDatesForDaily(daysDisplay, start) {
  var startDate = new Date();
  if (start && start.constructor === Date) {
    startDate = new Date(start);
  }

  daysDisplay = normalizeDaysDisplay(daysDisplay);
  var dates = [];
  for (var i = 0; i < daysDisplay; i++) {
    dates.push(updateDate(startDate, 'd', i));
  }
  return dates;
}

/**
 * Helper function to populate dates for weekly frequency
 */
function getDatesForWeekly(daysDisplay, daysInWeek, start) {
  var startDate = new Date();
  if (start && start.constructor === Date) {
    startDate = new Date(start);
  }

  daysDisplay = normalizeDaysDisplay(daysDisplay);

  // Calculate nearest future day w.r.t the given start date
  // starts from Monday
  var nextDay = 1;
  var nextDayIndex = 0;
  var nextDayMin = 7;
  var startDay = startDate.getDay();
  for (var i = 0; i < daysInWeek.length; i++) {
    // difference from start day to other days
    var otherDay = parseInt(daysInWeek[i]);
    var diff = otherDay - startDay;
    if (diff == 0) {
      // same day as current day
      nextDay = otherDay;
      nextDayIndex = i;
      nextDayMin = diff;
      Logger.log('Next day is today');
      Logger.log("startDay:" + startDay + ", otherDay:" + otherDay + ", diff:" + diff);
      break;
    } else if (diff > 0) {
      // future day within same week
      // if min is the same, always take future day
      Logger.log('Next day is located later in the current week');
      Logger.log("startDay:" + startDay + ", otherDay:" + otherDay + ", diff:" + diff);
      if (diff <= nextDayMin) {
        nextDay = otherDay;
        nextDayIndex = i;
        nextDayMin = diff;
      }
    } else {
      // future day out of same week
      var newDiff = diff + 7;
      Logger.log('Next day is located in the upcoming week');
      Logger.log("startDay:" + startDay + ", otherDay:" + otherDay + ", diff:" + newDiff);
      if (newDiff <= nextDayMin) {
        nextDay = otherDay;
        nextDayIndex = i;
        nextDayMin = newDiff;
      }
    }
  }
  Logger.log('Calculation of Next Day');
  Logger.log('nextDay:' + nextDay + ', nextDayIndex:' + nextDayIndex + ", nextDayMin:" + nextDayMin);


  // Calculate days between dates
  var daysBetween = [];
  var daysBetweenPrevious;
  var daysBetweenCurrent;
  if (daysInWeek.length <= 1) {
    // different in days to next week
    daysBetween.push(7);
  } else {
    for (var i = 0; i < daysInWeek.length; i++) {
      daysBetweenCurrent = parseInt(daysInWeek[i]);
      if (i > 0) {
        // difference in days withint same week
        daysBetween.push(daysBetweenCurrent - daysBetweenPrevious);
      }
      if (i == daysInWeek.length - 1) {
        // difference in days to next week
        daysBetween.push(parseInt(daysInWeek[0]) + 7 - daysBetweenCurrent);
      }
      daysBetweenPrevious = daysBetweenCurrent;
    }
  }

  Logger.log('Days Between Dates');
  Logger.log(JSON.stringify(daysBetween));

  var dates = [];
  var daysBetweenIndex = nextDayIndex;
  var dateBegin = updateDate(startDate, 'd', nextDayMin);
  for (var i = 0; i < daysDisplay; i++) {
    if (i > 0) {
      dateBegin = updateDate(dateBegin, 'd', daysBetween[daysBetweenIndex]);
      daysBetweenIndex++;
      daysBetweenIndex %= daysBetween.length;
    }
    dates.push(dateBegin);
  }
  return dates;
}

/**
 * Helper function to normalize days display to natural number
 */
function normalizeDaysDisplay(daysDisplay) {
  var days = parseInt(daysDisplay);
  return Math.max(0, isNaN(days) ? 0 : days);
}

/**
 * Helper function to populate roster timeable headers
 */
function updateTimetableHeaders(sheetname, A1Notation, dates) {

  Logger.log("UpdateTimeTableHeaders");

  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetname);
  if (sheet == null) {
    throw "No such sheet:[" + sheetname + "]";
  }

  var range = sheet.getRange(A1Notation);
  if (!isSingleRowRange(range)) {
    throw "Range give for timable headers must only be a single row."
  }

  if (!dates || dates.constructor !== Array || !dates.length) {
    Logger.log(JSON.stringify(dates));
    throw "Insufficent dates given for timetable headers"
  }

  var numColumns = range.getNumColumns();
  if (numColumns !== dates.length) {
    L
    Logger.log("Range: " + A1Notation);
    Logger.log("Dates:" + JSON.stringify(dates));
    throw "Dates do not match with the give range"
  }

  var datesInText = [];
  var datesFormat = [];
  for (var i = 0; i < numColumns; i++) {

    var dateFormat = "ddd (d-mmm)";
    var dateValue = "";

    if (dates[i] && dates[i].constructor === Date) {
      dateValue = new Date(dates[i]);
    }

    datesFormat.push(dateFormat);
    datesInText.push(dateValue);
  }

  range.setNumberFormats([datesFormat]);
  range.setValues([datesInText]);
}

/**
 * Create new roster sheet from existing
 */
function createFromExisting(sheetname) {}

var FREQUENCY_DAILY = 'd';
var FREQUENCY_WEEKLY = 'w';
var FREQUENCY_MONTHLY = 'm';
var FREQUENCY_CUSTOM = 'c';

function isValidFrequency(freq) {
  if (!freq) {
    return false;
  }
  return freq === FREQUENCY_DAILY ||
    freq === FREQUENCY_WEEKLY ||
    freq === FREQUENCY_MONTHLY ||
    freq === FREQUENCY_CUSTOM;
}

function isValidRange(sheetname, range) {
  var customRange = getCustomRange(sheetname, range);
  return customRange.getNumColumns() > 0 && customRange.getNumRows() > 0;
}

function isValidDaysInWeek(daysInWeek) {
  if (!daysInWeek) {
    return false;
  }
  var validDays = getValidDaysInWeek(daysInWeek);
  return validDays && validDays.length > 0;
}

/**
 * Opens a sidebar. The sidebar structure is described in the CreateFromExistingSidebar.html
 * project file.
 */
function showCreateFromExistingSidebar() {
  var ui = HtmlService.createTemplateFromFile('CreateFromExistingSidebar')
    .evaluate()
    .setTitle('Create With ...');
  SpreadsheetApp.getUi().showSidebar(ui);
}

/**
 * Opens a sidebar. The sidebar structure is described in the EditOptionsSidebar.html
 * project file.
 */
function showEditSidebar() {
  var ui = HtmlService.createTemplateFromFile('EditSidebar')
    .evaluate()
    .setTitle('Edit Roster');
  SpreadsheetApp.getUi().showSidebar(ui);
}

function update() {}

function refresh() {
  var ui = SpreadsheetApp.getUi();
  // Or DocumentApp or FormApp.
  ui.alert('You clicked the first menu item!');
}

function purge() {
  var ui = SpreadsheetApp.getUi();
  // Or DocumentApp or FormApp.
  ui.alert('You clicked the first menu item!');
}

/*
 * Helper function to get selected range in current active sheet
 */
function getSelectedRange() {
  try {
    var sheet = SpreadsheetApp.getActiveSheet();
    return sheet.getActiveRange().getA1Notation();
  } catch (e) {
    throw "No range selected.";
  }
}

/*
 * Helper function to get selected range with sheet name in current active sheet
 */
function getSelectedRangeWithSheetname() {
  try {
    var sheet = SpreadsheetApp.getActiveSheet();
    return {
      range: sheet.getActiveRange().getA1Notation(),
      sheetname: sheet.getName()
    };
  } catch (e) {
    throw "No range selected.";
  }
}

/*
 * Helper function to get range via A1 Notation in current active sheet
 */
function getRange(A1Notation) {
  try {
    var sheet = SpreadsheetApp.getActiveSheet();
    return sheet.getRange(A1Notation);
  } catch (e) {
    throw "Invalid A1 Notation [" + A1Notation + "] for range.";
  }
}

/*
 * Helper function to get range via A1 Notation in the given sheet nane
 */
function getCustomRange(sheetname, A1Notation) {
  try {
    var sheet = SpreadsheetApp.getActive().getSheetByName(sheetname);
    return sheet.getRange(A1Notation);
  } catch (e) {
    throw "Invalid A1 Notation [" + A1Notation + "] for sheet [" + sheetname + "].";
  }
}

/**
 * Helper function to determine if given range contains only 1 column
 */
function isSingleColumnRange(range) {
  var rangeColumn = range.getNumColumns();
  return rangeColumn === 1;
}

/**
 * Helper function to determine if given range contains only 1 row
 */
function isSingleRowRange(range) {
  var rangeRow = range.getNumRows();
  return rangeRow === 1;
}

/**
 * Helper function to return valid days in week
 */
function getValidDaysInWeek(daysInWeek) {
  var days = [];
  if (typeof daysInWeek === 'string') {
    days = daysInWeek.split(',');
  } else if (daysInWeek.constructor === Array) {
    days = daysInWeek;
  }

  var validatedDays = {};
  for (var d in days) {
    var number = parseInt(days[d]);
    if (number > 0 && number < 8) {
      validatedDays[number] = 1;
    }
  }

  var validated = [];
  for (var d in validatedDays) {
    validated.push(d);
  }

  return validated;
}

MINUTE_IN_SECONDS = 60;
HOUR_IN_SECONDS = 3600;
DAY_IN_SECONDS = 86400;
/**
 * Helper function to add duration to JavaScript datetime
 * supports only 's' seconds, 'm' minutes, 'h' hours, 'd' days
 */
function updateDate(date, time_unit, time_unit_scalar) {
  if (!date || date.constructor !== Date) {
    throw "Invalid date";
  }

  var time_unit_seconds = 0;
  if (time_unit === 's') {
    time_unit_seconds = 1;
  } else if (time_unit === 'm') {
    time_unit_seconds = MINUTE_IN_SECONDS;
  } else if (time_unit === 'h') {
    time_unit_seconds = HOUR_IN_SECONDS;
  } else if (time_unit === 'd') {
    time_unit_seconds = DAY_IN_SECONDS;
  } else {
    throw "Unsupported time unit [" + time_unit + "]";
  }

  if (isNaN(time_unit_scalar)) {
    throw "Invalid scalar number for time unit";
  }

  var newMiliseconds = date.getTime() + (time_unit_scalar * time_unit_seconds * 1000)
  return new Date(newMiliseconds);
}

/*
 * Helper function to get the default configurations
 */
function getDefaultConfig() {
  return {
    is_initialized: false,
    lookup: {
      sheet_name: 'Sheet1',
      range: {
        person_name: 'A:A',
        timeslot: 'B:B',
        timestamp: 'C:C'
      }
    },
    fillup: {
      sheet_name: 'Sheet2',
      range: {
        person_name: 'A:A',
        timetable_weekly: 'B:H',
        timestamp: 'I:I'
      },
      schedule_weekly: [1, 2, 3, 4, 5, 6, 7]
    },
    data_retention: {
      expiry_days: -1
    }
  }
};

/*
 * Helper function to read the configurations from Document properties service
 */
function readConfig() {
  var config = getDefaultConfig();
  var props = PropertiesService.getDocumentProperties();
  try {
    config.is_initialized = props.getProperty('IS_INITIALIZED');

    config.lookup.sheet_name = props.getProperty('LOOKUP_SHEET_NAME');
    config.lookup.range.person_name = props.getProperty('LOOKUP_RANGE_PERSON_NAME');
    config.lookup.range.timeslot = props.getProperty('LOOKUP_RANGE_TIMESLOT');
    config.lookup.range.timestamp = props.getProperty('LOOKUP_RANGE_TIMESTAMP');

    config.fillup.sheet_name = props.getProperty('FILLUP_SHEET_NAME');
    config.fillup.frequency = props.getProperty('FILLUP_FREQUENCY');

    config.fillup.days_in_week = props.getProperty('FILLUP_DAYS_IN_WEEK');
    config.fillup.days_display = props.getProperty('FILLUP_DAYS_DISPLAY');
    config.fillup.show_next = props.getProperty('FILLUP_SHOW_NEXT');

    config.fillup.range.person_name = props.getProperty('FILLUP_RANGE_PERSON_NAME');
    config.fillup.range.custom_sheet_name = props.getProperty('FILLUP_RANGE_DAYS_DISPLAY');
    config.fillup.range.custom_timetable = props.getProperty('FILLUP_RANGE_DAYS_DISPLAY');
    config.fillup.range.timestamp = props.getProperty('FILLUP_RANGE_TIMESTAMP');

    config.data_retention.expiry_days = props.getProperty('DATE_RETENTION_EXPIRY_DAYS');

  } catch (e) {
    throw "Unable to read config for the sheet."
  }
  return config;
}

/*
 * Helper function to save the configurations to Document properties service
 */
function saveConfig(config) {
  var props = PropertiesService.getDocumentProperties();
  try {
    if (!props.getProperty('IS_INITIALIZED')) {
      // only update 'IS_INITIALIZED' if it is not initialized
      props.setProperty('IS_INITIALIZED', config.is_initialized);
    }
    props.setProperties({
      // 'IS_INITIALIZED' : config.is_initialized,

      'LOOKUP_SHEET_NAME': config.lookup.sheet_name,
      'LOOKUP_RANGE_PERSON_NAME': config.lookup.range.person_name,
      'LOOKUP_RANGE_TIMESLOT': config.lookup.range.timeslot,
      'LOOKUP_RANGE_TIMESTAMP': config.lookup.range.timestamp,

      'FILLUP_SHEET_NAME': config.fillup.sheet_name,
      'FILLUP_RANGE_PERSON_NAME': config.fillup.range.person_name,
      'FILLUP_RANGE_TIMETABLE_WEEKLY': config.fillup.range.timetable_weekly,
      'FILLUP_RANGE_TIMESTAMP': config.fillup.range.timestamp,

      'DATE_RETENTION_EXPIRY_DAYS': config.data_retention.expiry_days,
    });

  } catch (e) {
    throw "Unable to save config for the sheet."
  }
}