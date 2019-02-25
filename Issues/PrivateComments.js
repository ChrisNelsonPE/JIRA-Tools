// ==UserScript==
// @name         Jira private comments
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Make comments private by default when SF link is present
// @author       Chris Nelson
// @include      https://jira.automate.local/browse/MAINT-*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Adapted from https://community.atlassian.com/t5/Jira-questions/The-comment-visibility-default-selection-can-be-configured/qaq-p/450149
    // (That is for an older version of Jira.  This works with v7.11.)
    var restrictComments = function(groupOrRole) {
        console.log("Trying to restrict comments");
        var security = document.getElementsByClassName("security-level")[0];
        var commentLevelSelect = security.getElementsByTagName("select")[0];
        console.log("commentLevelSelect is " + commentLevelSelect);
        // commentLevelSelect is a SELECT, find the OPTION child which has innerText of "Developers"
        var options = commentLevelSelect.getElementsByTagName("option");
        for (var i = 0; i < options.length; ++i) {
            if (options[i].innerText == groupOrRole) {
                commentLevelSelect.selectedIndex = i;
                break;
            }
        }

        // jQuery("#commentLevel-multi-select a.drop span.icon").removeClass("icon-unlocked").addClass("icon-locked");
        var e = document.getElementById("commentLevel-multi-select");
        e = e.getElementsByClassName("drop")[0];
        e = e.getElementsByClassName("security-level-drop-icon")[0];
        e.classList.remove("aui-iconfont-unlocked");
        e.classList.add("aui-iconfont-locked");
        // var htmlEscapedLabel = AJS.$("&lt;div/&gt;").text(labelText).html();
        // jQuery(".security-level span.current-level").html(AJS.format(AJS.params.securityLevelViewableRestrictedTo, htmlEscapedLabel));
        e = security.getElementsByClassName("current-level")[0];
        e.innerText = groupOrRole;
    };

    var sfLink = false;
    console.log("Jira private comments");
    var elements = document.getElementsByTagName("strong");
    for (var i = 0; i < elements.length; ++i) {
        var e = elements[i];
        if (e.title = "SF Case Number") {
            sfLink = true;
        }
    }
    if (sfLink) {
        console.log("SF link present");
        restrictComments("Developers");
    }
})();