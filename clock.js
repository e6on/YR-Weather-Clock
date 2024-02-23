// Function to load the Google API library
function loadGapi() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/platform.js';
        script.onload = () => {
            gapi.load('client', resolve);
        };
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

function getValue(obj, key) {
    let value;
    for (let k in obj) {
        if (k === key) {
            return obj[k];
        }
        if (obj[k] && typeof obj[k] === 'object') {
            value = getValue(obj[k], key);
            //console.log(value);
            if (value !== undefined) {
                return value;
            }
        }
    }
    return value;
}

// Get today's date in the correct format.
let today = new Date();
//today.setMonth(2, 31);
let tomorrow = new Date();
tomorrow.setDate(today.getDate() + 1);
//tomorrow.setMonth(3, 1);
var forISO_today = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
var forISO_tomorrow = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000);
today = forISO_today.toISOString(); // "2023-04-23T00:00:00.000Z"
tomorrow = forISO_tomorrow.toISOString(); // "2023-04-24T00:00:00.000Z"
let cal_event = "";
//console.log(today, tomorrow);

// Function to start the Google Calendar API
function start() {
    // Initialize the client with API key and People API version.
    gapi.client.init({
        apiKey: 'API KEY',
        discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest"],
    }).then(function () {
        // Use Google's "apis-explorer" for research: https://developers.google.com/apis-explorer/#s/calendar/v3/
        //console.log(today);
        return gapi.client.calendar.events.list({
            'calendarId': 'et.ee#holiday@group.v.calendar.google.com', // Use your calendar ID.
            'timeMin': today,
            'timeMax': today,
            'showDeleted': false,
            'singleEvents': true,
            'orderBy': 'startTime'
        });
    }).then(function (response) {
        //console.log(response.result.items); // Do what you need with these events.
        //console.log(getValue(response.result.items, "summary"));
        if (getValue(response.result.items, "summary") !== undefined) { cal_event = getValue(response.result.items, "summary"); }
    }, function (reason) {
        console.log('Error: ' + reason.result.error.message);
    });
};

// Load the Google API library and start the Google Calendar API
loadGapi().then(start).catch(console.error);


function updateClock() {
    var now = new Date();

    var hours = addZeroPadding(now.getHours());
    var minutes = addZeroPadding(now.getMinutes());
    var seconds = addZeroPadding(now.getSeconds());
    var day = now.toLocaleString('et-EE', { weekday: 'long' }); // Get day name;
    var month = now.toLocaleString('et-EE', { month: 'numeric' }); // Get month

    var time = hours + ':' + minutes;
    var date = now.getDate() + '.' + addZeroPadding(month) + '.' + now.getFullYear();

    document.getElementById('cal_event').innerHTML = cal_event;
    document.getElementById('day').innerHTML = day;
    document.getElementById('date').innerHTML = date;
    document.getElementById('time').innerHTML = time;
    document.getElementById('seconds').innerHTML = seconds;
    //console.log(now);
    setTimeout(updateClock, 1000); // Update every 1000 millisecond
}

// Function to add zero padding to numbers less than 10
function addZeroPadding(num) {
    return (num < 10 ? '0' : '') + num;
}

// Start the clock
updateClock();