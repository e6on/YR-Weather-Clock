// Get today's date in the correct format.
let today = new Date();
//today.setMonth(7, 23);
var forISO_today = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
today = forISO_today.toISOString().slice(0, forISO_today.toISOString().indexOf("T")); // 2023-04-23
let cal_event = "";
console.log(today);

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
                console.log(cal_event);
            } else {
                console.log('No holiday found on this date');
            }
        }
    }
    xhr.send();
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

// Get holiday
getPyhad(today);
// Start the clock
updateClock();