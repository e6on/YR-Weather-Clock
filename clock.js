// Get today's date in the correct format.
var today = new Date();
//today.setMonth(2, 18);
//today.setMonth(0, 1);
var forISO_today = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
event_date = forISO_today.toISOString().slice(0, forISO_today.toISOString().indexOf("T")); // 2023-04-23
let cal_event = "";

// Get holidays from https://xn--riigiphad-v9a.ee/ using https://corsproxy.io
function getPyhad(date) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://corsproxy.io/?https://xn--riigiphad-v9a.ee/et/koik?output=json', true);
    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4 && xhr.status == 200) {
            var holidays = JSON.parse(xhr.responseText);
            var holiday = holidays.find(holiday => holiday.date === date);
            if (holiday) {
                cal_event = holiday.title;
                console.log(today, '-', cal_event);
            } else {
                console.log(today, "No holiday found on this date");
            }
        }
    }
    if (date === today.getFullYear() + "-03-18") { cal_event = "PALJU &Otilde;NNE S&Uuml;NNIP&Auml;EVAKS!" }
    xhr.send();
}

function sun_moon() {
    // get moon phase
    var moon = SunCalc.getMoonIllumination(today);
    var moon_phase = moon.phase;
    var moon_angle = moon.angle;
    var waxwan = true;
    if (Math.sign(moon_angle) === 1) { waxwan = false }; // moon waning
    if (Math.sign(moon_angle) === -1) { waxwan = true }; // moon waxing
    //console.log("Moon phase:", moon_phase, "Moon angle:", moon_angle);
    document.getElementById('moon').innerHTML = "";
    drawPlanetPhase(document.getElementById('moon'), moon_phase, waxwan, { diameter: 70, earthshine: 0, blur: 2, lightColour: '#999999', shadowColour: '#0A0A0A' });

    // get sunset & sunrise times
    let lat = 59.443;
    let lon = 24.738;
    var today_sun_times = SunCalc.getTimes(today, lat, lon);
    // format sunrise time
    var today_sunriseStr = today_sun_times.sunrise.getHours() + ':' + addZeroPadding(today_sun_times.sunrise.getMinutes());
    // format sunset time
    var today_sunsetStr = today_sun_times.sunset.getHours() + ':' + addZeroPadding(today_sun_times.sunset.getMinutes());

    //console.log("Sunrise: " + today_sunriseStr + " Sunset: " + today_sunsetStr);
    document.getElementById('sunrisetime').innerHTML = today_sunriseStr;
    document.getElementById('sunsettime').innerHTML = today_sunsetStr;
    setTimeout(sun_moon, 60000); // Update every 60000 millisecond (1 minute)
}

function updateClock() {
    var now = new Date();
    var hours = addZeroPadding(now.getHours());
    var minutes = addZeroPadding(now.getMinutes());
    var seconds = addZeroPadding(now.getSeconds());
    var day = now.toLocaleString('et-EE', { weekday: 'long' }); // Get day name;
    var month = now.toLocaleString('et-EE', { month: 'numeric' }); // Get month

    var time = hours + ':' + minutes;
    var date = now.getDate() + '.' + addZeroPadding(month) + '.' + now.getFullYear();
    //console.log(date);

    document.getElementById('day').innerHTML = day;
    document.getElementById('date').innerHTML = date;
    document.getElementById('time').innerHTML = time;
    document.getElementById('seconds').innerHTML = seconds;

    // Replace day with holiday
    if (cal_event.length !== 0) {
        document.getElementById('day').classList.add("cal_event");
        document.getElementById('day').innerHTML = cal_event;
        if (cal_event.length > 31) {
            document.getElementById('day').classList.add("cal_font");
        }
    };
    //console.log(now);
    setTimeout(updateClock, 1000); // Update every 1000 millisecond (1 second)
}

// Function to add zero padding to numbers less than 10
function addZeroPadding(num) {
    return (num < 10 ? '0' : '') + num;
}

// Get holiday
getPyhad(event_date);
// Start the clock
updateClock();
// Get sun & moon
sun_moon();


