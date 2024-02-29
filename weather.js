let url = "https://api.met.no/weatherapi/locationforecast/2.0/complete";
let lat = 59.443;
let lon = 24.738;
let theme = "realistic"; // themes: "yr", "anim", "realistic"
var ext = ".svg";
var numOfdays = 3;
var forecast = "";
const today = new Date();
//today.setHours(16);
//today.setMinutes(55);
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
var forISO_date = new Date(today.getTime() - today.getTimezoneOffset() * 60000);

if (theme === "realistic") { ext = ".png" }

function nextDate(days) {
    const nextDay = new Date(forISO_date);
    nextDay.setDate(forISO_date.getDate() + days);
    console.log("Next date " + nextDay.toISOString().slice(0, nextDay.toISOString().indexOf("T") + 1));
    return nextDay.toISOString().slice(0, nextDay.toISOString().indexOf("T") + 1); //2024-02-01T   
}

function addZero(i) {
    if (i < 10) { i = "0" + i }
    return i;
}

function formatDate(d) {
    // 2024-02-01T13:00:00Z --> N 01 VEEBR
    const jsonDate = new Date(d);
    var fixed_date = new Date(jsonDate.getTime() + jsonDate.getTimezoneOffset() * 60000);
    const day = fixed_date.getDay();
    const days = ["P", "E", "T", "K", "N", "R", "L"];
    const date = fixed_date.getDate();
    const month = fixed_date.getMonth();
    const months = ["JAAN", "VEEBR", "MÄRTS", "APR", "MAI", "JUUNI", "JUULI", "AUG", "SEPT", "OKT", "NOV", "DETS"];
    //console.log(days[day] + " " + date + " " + months[month]);
    console.log("Formatting to date " + days[day] + " " + date + " " + months[month]);
    return "&nbsp;<span>" + days[day] + "</span>&nbsp;&nbsp;" + date + "&nbsp;" + months[month];
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

function getValues(obj, timeKey, duration, ...keys) {
    // Define the fallback hours
    const fallbackHours = ['00', '06', '12', '18'];

    // Iterate over the timeseries data
    for (let timeData of obj.properties.timeseries) {
        // Check if the timeKey matches with the time in the data
        if (timeData.time.startsWith(timeKey) && Object.keys(extractValues(timeData, duration, keys)).length !== 0) {
            //console.log(timeData);
            return extractValues(timeData, duration, keys);
        }
    }

    // If no match was found for the timeKey, look for the fallback hours
    let hour = parseInt(timeKey.split('T')[1].split(':')[0]);
    let date = timeKey.split('T')[0];
    let fallbackHour;
    if (hour > 0 && hour < 6) {
        fallbackHour = '00';
    } else if (hour > 6 && hour < 12) {
        fallbackHour = '06';
    } else if (hour > 12 && hour < 18) {
        fallbackHour = '12';
    } else if (hour > 18 && hour <= 23) {
        fallbackHour = '18';
    }

    if (fallbackHour) {
        for (let timeData of obj.properties.timeseries) {
            // Extract the hour and date from the time
            let timeHour = timeData.time.split('T')[1].split(':')[0];
            let timeDate = timeData.time.split('T')[0];

            // Check if the hour matches with the fallback hour and the date matches with the date of the timeKey
            if (timeHour === fallbackHour && timeDate === date) {
                //console.log(timeData);
                return extractValues(timeData, duration, keys);
            }
        }
    }
    console.log(`TimeKey "${timeKey}" does not match with the time in the data and no fallback hour was found.`);
}

function extractValues(timeData, duration, keys) {
    let results = {};
    // Iterate over the keys
    for (let key of keys) {
        // Check if the duration exists in the data
        if (timeData.data.hasOwnProperty(duration)) {
            // Check if the summary exists and the key exists in the summary of the duration
            if (timeData.data[duration].summary && timeData.data[duration].summary.hasOwnProperty(key)) {
                // Add the key-value pair to the results
                results[key] = timeData.data[duration].summary[key];
            }
            // Check if the details exist and the key exists in the details of the duration
            else if (timeData.data[duration].details && timeData.data[duration].details.hasOwnProperty(key)) {
                // Add the key-value pair to the results
                results[key] = timeData.data[duration].details[key];
            }
        }
    }
    return results;
}

$.getJSON(url + `?lat=` + lat + `&lon=` + lon, function (data, status) {

    if (status === "success") {

        // get sunset & sunrise times
        // get today's sunlight times
        var today_sun_times = SunCalc.getTimes(today, lat, lon);
        // format sunrise time from the Date object
        var today_sunriseStr = today_sun_times.sunrise.getHours() + ':' + today_sun_times.sunrise.getMinutes();
        // format sunrise time from the Date object
        var today_sunsetStr = today_sun_times.sunset.getHours() + ':' + today_sun_times.sunset.getMinutes();
        // get tomorrow sunlight times
        var tomorrow_sun_times = SunCalc.getTimes(tomorrow, lat, lon);
        // format sunrise time from the Date object
        var tomorrow_sunriseStr = tomorrow_sun_times.sunrise.getHours() + ':' + tomorrow_sun_times.sunrise.getMinutes();
        var sunrise_hour = today_sun_times.sunrise.getHours();
        var sunrise_minute = today_sun_times.sunrise.getMinutes();
        var sunset_hour = today_sun_times.sunset.getHours();
        var sunset_minute = today_sun_times.sunset.getMinutes();

        $(".maincontainer").html("Getting sun times... " + today_sunriseStr + " " + today_sunsetStr + " " + tomorrow_sunriseStr);
        console.log("Getting sun times... " + today_sunriseStr + " " + today_sunsetStr + " " + tomorrow_sunriseStr);

        var today_sunrise = "<img class='icon' src='./images/common/sunrise.svg' alt='sunrise' /><div>" + today_sunriseStr + "</div>";
        var today_sunset = "<img class='icon' src='./images/common/sunset.svg' alt='sunset' /><div>" + today_sunsetStr + "</div>";
        var tomorrow_sunrise = "<img class='icon' src='./images/common/sunrise.svg' alt='sunrise' /><div>" + tomorrow_sunriseStr + "</div>";
        var sun = today_sunrise;

        var sunrise_nr = Number(sunrise_hour + "." + sunrise_minute);
        var sunset_nr = Number(sunset_hour + "." + sunset_minute);
        var time_nr = Number(today.getHours() + "." + addZero(today.getMinutes()));
        //console.log("sunrise " + sunrise_nr + " time " + time_nr + " sunset " + sunset_nr);

        // display sunset when sun is rised
        if (time_nr > sunrise_nr && time_nr < sunset_nr) { sun = today_sunset; }
        // display tomorrows sunrise when sun is set
        if (sunset_nr < time_nr) { sun = tomorrow_sunrise; }

        // Get instant and forecast for today
        $(".maincontainer").html("Getting forecast for " + nextDate(0));
        console.log("Getting forecast for " + nextDate(0));
        var today_date = nextDate(0) + addZero(today.getHours()); // 2024-02-02T14
        var today_values_instant = getValues(data, today_date, "instant", "air_temperature", "wind_speed");
        var today_values1h = getValues(data, today_date, "next_1_hours", "symbol_code");
        var today_values6h = getValues(data, today_date, "next_6_hours", "air_temperature_max", "air_temperature_min", "symbol_code");

        // format todays instant temperature display
        var today_temp = getValue(today_values_instant, "air_temperature");
        var tempString = today_temp.toString();
        const tempArray = tempString.split(".");
        var todayTempSplit1 = tempArray[0];
        if (tempArray.length > 1) {
            var todayTempSplit2 = "<div class='tempsplit deg'>&deg;</div><div class='tempsplit t2'>." + tempArray[1] + "</div>";
        } else {
            var todayTempSplit2 = "<div class='tempsplit deg'>&deg;</div><div class='tempsplit t2'>.0</div>";
        };

        var today_wind_speed = getValue(today_values_instant, "wind_speed");
        var today_1h_symbol = getValue(today_values1h, "symbol_code");
        var air_temp_max = getValue(today_values6h, "air_temperature_max");
        var air_temp_min = getValue(today_values6h, "air_temperature_min");
        var today_6h_symbol = getValue(today_values6h, "symbol_code");

        // display day icon between sunrise and sunset
        if (time_nr > sunrise_nr && time_nr < sunset_nr) {
            today_1h_symbol = today_1h_symbol.replace("_night", "_day");
            today_6h_symbol = today_6h_symbol.replace("_night", "_day");
        }

        // Make instant weather for today html
        var today_condition = "<img class='conditionpic' src='./images/" + theme + "/" + today_1h_symbol + ext + "' alt='" + today_1h_symbol + "' />";
        var today_temperature = "<div class='temp'><div class='t1'>" + todayTempSplit1 + "</div>" + todayTempSplit2 + "</div>";
        var windicon = "wind";
        var thunder = "";
        if (today_1h_symbol.includes("thunder")) { thunder = "<img class='icon image2' src='./images/common/thunder.svg' alt='thunder' />" }
        if (today_wind_speed < 13) { windicon = "wind-" + parseInt(today_wind_speed) }
        var today_wind = "<div class='parent'><img class='icon image1' src='./images/common/" + windicon + ".svg' alt='wind' />" + thunder + "</div><div>" + today_wind_speed + "</div>";
        var today_start = "<div class='daycontainer'>";
        var today_end = "</div>";
        var propsstart = "<div class='item propscontainer'>";
        var propsend = "</div>";
        var today_text = today_start + propsstart + today_wind + sun + propsend + today_condition + today_temperature + today_end;
        // Make forecast for today html
        var forecast_time = "<div class='item time'>" + formatDate(today_date + ":00:00Z") + "</div>";
        var forecast_condition = "<img class='conditionpic' src='./images/" + theme + "/" + today_6h_symbol + ext + "' alt='" + today_6h_symbol + "' />";
        var forecast_air_temperature_max = "<div class='item tempmax'>" + air_temp_max + "&deg;</div>";
        var forecast_air_temperature_min = "<div class='item tempmin'>" + air_temp_min + "&deg;</div>";
        var forecast_today = forecast_time + forecast_condition + forecast_air_temperature_max + forecast_air_temperature_min;
        var today_text = today_text + today_start + forecast_today + today_end;

        $(".maincontainer").html("Getting forecasts for " + numOfdays + " days");
        console.log("Getting forecasts for " + numOfdays + " days");
        for (var j = 1; j <= numOfdays; j++) {
            var date = nextDate(j) + "06"; // 2024-02-02T06

            //console.log(date);
            //console.log(today_values_instant);

            // Get forecast for next days
            var days_values6h = getValues(data, date, "next_6_hours", "air_temperature_max", "air_temperature_min", "symbol_code");
            var days_values12h = getValues(data, date, "next_12_hours", "symbol_code");
            //console.log(days_values6h);
            //console.log(days_values12h);
            var air_temp_max = getValue(days_values6h, "air_temperature_max");
            var air_temp_min = getValue(days_values6h, "air_temperature_min");
            if (getValue(days_values12h, "symbol_code") !== undefined) {
                var symbol_code = getValue(days_values12h, "symbol_code");
            } else {
                var symbol_code = getValue(days_values6h, "symbol_code");
            }

            //console.log(sunrise_hour, sunrise_minute, sunset_hour, sunset_minute);
            //console.log(today.getHours(), today.getMinutes());
            symbol_code = symbol_code.replace("_night", "_day");
            //console.log("max: " + air_temp_max + " min: " + air_temp_min + " code: " + symbol_code);

            // Make forecast for next days html
            var days_start = "<div class='daycontainer'>";
            var days_end = "</div>";
            var forecast_time = "<div class='item time'>" + formatDate(date + ":00:00Z") + "</div>";
            var forecast_condition = "<img class='conditionpic' src='./images/" + theme + "/" + symbol_code + ext + "' alt='" + symbol_code + "' />";
            var forecast_air_temperature_max = "<div class='item tempmax'>" + air_temp_max + "&deg;</div>";
            var forecast_air_temperature_min = "<div class='item tempmin'>" + air_temp_min + "&deg;</div>";
            var forecast_days = forecast_time + forecast_condition + forecast_air_temperature_max + forecast_air_temperature_min;
            var forecast_text = days_start + forecast_days + days_end;

            console.log('Generating forecast for ' + date);
            $(".maincontainer").html('Generating forecast for ' + date);
            forecast = forecast + forecast_text;
            $(".maincontainer").html(forecast);


        }
        forecast = today_text + forecast;
        $(".maincontainer").html(forecast);

    } else {
        console.error(status);
        var err = `ERROR: ${status}`;
        $(".maincontainer").html(err);
    }
    console.log("Weather refreshed at " + today);
});

