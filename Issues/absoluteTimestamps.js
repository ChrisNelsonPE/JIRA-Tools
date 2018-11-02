// ==UserScript==
// @name         Jira absolute timestamps
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Display absolute time instead of "10 minutes ago", "Yesterday", etc.
// @author       Chris Nelson
// @include      https://jira.automate.local/*
// @grant        none
// ==/UserScript==
(function() {
    'use strict';
    // Format to "23/Oct/18 11:58 AM"
    var formatDate = function(date) {
        var months = [
            "Jan", "Feb", "Mar",
            "Apr", "May", "Jun",
            "Jul", "Aug", "Sep",
            "Oct", "Nov", "Dec"
            ];

        var hours = date.getHours();
        var amPm = hours > 11 ? "PM" : "AM";

        if (hours == 0) {
            hours = 12;
        }
        else if (hours > 12) {
            hours = hours - 12;
        }

        if (hours < 10) {
            hours = "0" + hours;
        }

        var minutes = date.getMinutes();
        if (minutes < 10) {
            minutes = "0" + minutes;
        }

        var year = date.getFullYear().toString().substring(2,4);

        var s = date.getDate() + "/" +
            months[date.getMonth()] + "/" +
            year + " " +
            hours + ":" + minutes + " " + amPm;
        return s;
    };

    var fixUpTimestamps = function() {
        var i; // An index
        var e; // A DOM element
        var time; // A <time> element

        var absolute;
        var relative;

        var dates = document.getElementsByClassName("date");
        console.log(dates.length + " dates to fix.");
        for (i = 0; i < dates.length; ++i) {
            e = dates[i];
            absolute = e.title;

            time = e.getElementsByTagName("time")[0];

            if (time && time.className == "livestamp") {
                var dt = time.attributes.datetime.nodeValue;
                absolute = formatDate(new Date(dt));
            }
            else if (e.nodeName == "DD" && e.title == "") {
                // SF Creation date has a slightly different structure.
                var span = time.parentNode;
                absolute = span.title;
            }
            else {
                absolute = e.title;
            }

            if (time) {
                relative = time.innerHTML;
            }
            else {
                relative = "";
            }

            e.innerHTML = absolute;
            e.title = relative;
            console.log("JAT: Updated " + e.nodeName + ":" + relative + " -> " + absolute);
        }
        console.log("Done");
    }

    // Adapted from https://stackoverflow.com/questions/18989345
    /*--- Note, gmMain () will fire under all these conditions:
    1) The page initially loads or does an HTML reload (F5, etc.).
    2) The scheme, host, or port change.  These all cause the browser to
       load a fresh page.
    3) AJAX changes the URL (even if it does not trigger a new HTML load).
    */
    var fireOnHashChangesToo = true;
    var pageURLCheckTimer = setInterval (
        function () {
            if (this.lastPathStr !== location.pathname
                || this.lastQueryStr !== location.search
                || (fireOnHashChangesToo && this.lastHashStr !== location.hash)
            ) {
                this.lastPathStr = location.pathname;
                this.lastQueryStr = location.search;
                this.lastHashStr = location.hash;
                // 1000ms after the change, assume the page is loaded
                // and try to fix up timestamps.
                setTimeout(fixUpTimestamps, 1000);
            }
        }
        , 111
    );
})();
