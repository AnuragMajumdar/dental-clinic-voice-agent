function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);

    // Feather webhook sends callId/agentId directly — no action field
    if (data.callId && data.agentId) return handleFeatherWebhook(sheet, data);

    if (!data.action) {
      return respond({ error: "Missing action" });
    }

    if (data.action === "verify_patient") return verifyPatient(sheet, data);
    if (data.action === "log_call") return logCall(sheet, data);
    if (data.action === "book_appointment") return bookAppointment(data);
    if (data.action === "register_patient") return registerPatient(sheet, data);
    if (data.action === "feather_webhook") return handleFeatherWebhook(sheet, data);

    return respond({ error: "Unknown action" });
  } catch (err) {
    return respond({ error: "Server error", message: err.message });
  }
}

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet();
    var action = e.parameter.action;

    if (action === "lookup_patient") return lookupPatient(sheet, e.parameter);

    return respond({ error: "Unknown action" });
  } catch (err) {
    return respond({ error: "Server error", message: err.message });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function lookupPatient(sheet, params) {
  var patients = sheet.getSheetByName("Patients");
  var data = patients.getDataRange().getValues();
  var headers = data[0];
  var phoneCol = headers.indexOf("phone_number");

  if (phoneCol === -1) return respond({ error: "phone_number column not found" });

  var phone = String(params.phone_number || "").trim();
  if (!phone) return respond({ found: false, reason: "No phone number provided" });

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][phoneCol]).trim() === phone) {
      var patient = {};
      headers.forEach(function(h, idx) { patient[h] = data[i][idx]; });
      return respond({ found: true, patient: patient });
    }
  }
  return respond({ found: false });
}

function verifyPatient(sheet, data) {
  if (!data.first_name || !data.last_name || !data.date_of_birth) {
    return respond({ verified: false, reason: "Missing required fields" });
  }

  var patients = sheet.getSheetByName("Patients");
  var allData = patients.getDataRange().getValues();
  var headers = allData[0];

  var fnCol = headers.indexOf("first_name");
  var lnCol = headers.indexOf("last_name");
  var dobCol = headers.indexOf("date_of_birth");

  var givenDob = formatDateToYMD(data.date_of_birth);

  for (var i = 1; i < allData.length; i++) {
    var nameMatch =
      String(allData[i][fnCol]).toLowerCase().trim() === String(data.first_name).toLowerCase().trim() &&
      String(allData[i][lnCol]).toLowerCase().trim() === String(data.last_name).toLowerCase().trim();

    if (nameMatch) {
      var storedDob = formatDateToYMD(allData[i][dobCol]);
      if (storedDob === givenDob) {
        var patient = {};
        headers.forEach(function(h, idx) { patient[h] = allData[i][idx]; });
        return respond({ verified: true, patient: patient });
      } else {
        return respond({ verified: false, reason: "DOB mismatch" });
      }
    }
  }
  return respond({ verified: false, reason: "Patient not found" });
}

function formatDateToYMD(dateInput) {
  if (dateInput instanceof Date) {
    var y = dateInput.getFullYear();
    var m = String(dateInput.getMonth() + 1).padStart(2, '0');
    var d = String(dateInput.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  var str = String(dateInput).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    var y = parsed.getUTCFullYear();
    var m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    var d = String(parsed.getUTCDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return str;
}

function registerPatient(sheet, data) {
  if (!data.first_name || !data.last_name || !data.date_of_birth) {
    return respond({ success: false, error: "Missing required fields" });
  }

  var patients = sheet.getSheetByName("Patients");
  var allData = patients.getDataRange().getValues();
  var headers = allData[0];

  var fnCol = headers.indexOf("first_name");
  var lnCol = headers.indexOf("last_name");
  var dobCol = headers.indexOf("date_of_birth");
  var emailCol = headers.indexOf("email");
  var phoneCol = headers.indexOf("phone_number");

  var givenDob = formatDateToYMD(data.date_of_birth);

  // Check if patient already exists — update if found
  for (var i = 1; i < allData.length; i++) {
    var sameName =
      String(allData[i][fnCol]).toLowerCase().trim() === String(data.first_name).toLowerCase().trim() &&
      String(allData[i][lnCol]).toLowerCase().trim() === String(data.last_name).toLowerCase().trim();
    var sameDob = formatDateToYMD(allData[i][dobCol]) === givenDob;

    if (sameName && sameDob) {
      var existingId = String(allData[i][0]);
      if (data.email) patients.getRange(i + 1, emailCol + 1).setValue(data.email);
      if (data.phone_number) patients.getRange(i + 1, phoneCol + 1).setValue(data.phone_number);
      return respond({ success: true, patient_id: existingId, updated: true });
    }
  }

  // Assign doctor alternately: even count → Dr. Mehta, odd → Dr. Sharma
  var totalPatients = allData.length - 1;
  var assignedDoctor = (totalPatients % 2 === 0) ? "Dr. Mehta" : "Dr. Sharma";

  // Generate next patient ID
  var lastId = String(allData[allData.length - 1][0]);
  var nextNum = parseInt(lastId.replace(/[^0-9]/g, "")) + 1;
  var newId = "P" + String(nextNum).padStart(3, "0");

  patients.appendRow([
    newId,
    data.first_name,
    data.last_name,
    data.date_of_birth,
    data.phone_number || "",
    data.email || "",
    "",
    "",
    "",
    assignedDoctor
  ]);

  return respond({ success: true, patient_id: newId, assigned_doctor: assignedDoctor, updated: false });
}

function bookAppointment(data) {
  if (!data.event_type_id || !data.start_time || !data.patient_email) {
    return respond({ success: false, error: "Missing required booking fields" });
  }

  try {
    var payload = {
      "eventTypeId": parseInt(data.event_type_id),
      "start": data.start_time,
      "attendee": {
        "name": data.patient_name || "",
        "email": data.patient_email,
        "timeZone": data.timezone || "Asia/Kolkata"
      }
    };

    var options = {
      "method": "post",
      "contentType": "application/json",
      "headers": {
        "Authorization": "Bearer cal_live_ad0c249467582e73884b3818b5334eaf",
        "cal-api-version": "2024-08-13"
      },
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };

    var response = UrlFetchApp.fetch("https://api.cal.com/v2/bookings", options);
    var result = JSON.parse(response.getContentText());
    return respond(result);
  } catch (err) {
    return respond({ success: false, error: "Booking failed", message: err.message });
  }
}

function logCall(sheet, data) {
  try {
    var callLog = sheet.getSheetByName("CallLog");
    callLog.appendRow([
      data.call_id || "",
      data.patient_id || "",
      new Date().toISOString(),
      data.symptoms || "",
      data.urgency || "",
      data.appointment_type || "",
      data.appointment_datetime || "",
      data.notes || "",
      data.verification_status || ""
    ]);
    return respond({ success: true });
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function handleFeatherWebhook(sheet, data) {
  try {
    var callLog = sheet.getSheetByName("CallLog");
    var callData = data.agentCall || data;
    callLog.appendRow([
      callData.id || callData.callId || "",
      callData.patient_id || "",
      callData.callStartedAt || callData.startedAt || new Date().toISOString(),
      callData.summary || "",
      callData.urgency || "",
      callData.appointment_type || "",
      callData.appointment_datetime || "",
      callData.postCallAnalysis || "",
      callData.verification_status || ""
    ]);
    return respond({ success: true });
  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function authorizeScript() {
  UrlFetchApp.fetch("https://www.google.com");
  Logger.log("Authorization successful");
}
