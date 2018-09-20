var app = angular.module('jiragantt', []);

// This only works if you
// * install
// https://chrome.google.com/webstore/detail/allow-control-allow-origi/nlfbmbojpeacfghkpbjhddihlkkiljbi?hl=en
// * enable it
// * configure it to intercept https://<yourJiraRoot>/rest/api/*
app.config(function($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
});

app.controller('MainCtrl', function($scope, $http, $q) {
    document.title = "Jira Gantt";

    vm = this;
    // Your Jira server's domain like "yourCompany.atlassian.net" or
    // "jira.yourCompany.local".  "https://" is assumed and added by
    // the code when building a request.
    vm.domain = ""

    // Your "active tickets" filter which has JQL like
    //   "sprint in openSprints()"
    vm.filterNumber = "";

    // Your Jira user ID and password (optionaly cached in local storage)
    vm.userId = "";
    vm.password = "";
    
    var storageKey = "jiraGantt";

    var domain = localStorage.getItem(storageKey+".Domain");
    if (domain != null) {
        vm.domain = domain;
    }

    var filter = localStorage.getItem(storageKey+".Filter");
    if (filter != null) {
        vm.filterNumber = filter;
    }

    // FUTURE - save these in local storage?
    // Default estimate for unestimated tickets.  Better than 0 but
    // not really experience-based.
    vm.defaultEstimateHours = 8;

    // Available hours per day (per developer) after meetings,
    // unscheduled maintenance, etc.
    vm.availableHours = 5;

    // Number of days remaining to finish work
    vm.daysRemaining = 1;

    var credential = localStorage.getItem(storageKey+".Cred");
    if (credential != null) {
        var parts = atob(credential).split(":");
        vm.userId = parts[0];
        vm.password = parts[1]
        // If we found credentials, it's because the user wanted last time
        // to remember them so set remember true now, too.
        vm.remember = true;
    }

    // var here causes scoping problems, at least inside Angular.
    g = new JSGantt.GanttChart('g',document.getElementById('GanttChartDIV'), 'day',1);
    g.setShowRes(0); // Show/Hide Responsible (0/1)
    g.setShowDur(0); // Show/Hide Duration (0/1)
    g.setShowComp(0); // Show/Hide % Complete(0/1)
    g.setShowStartDate(0);
    g.setShowEndDate(0);
    g.setCaptionType('Resource');  // Set to Show Caption (None,Caption,Resource,Duration,Complete)
    g.AddTaskItem(new JSGantt.TaskItem(g, 1,   'Define Chart API',     '',          '',          '#ff0000', 'http://help.com', 0, 'Brian',     0, 1, 0, 1));
    g.AddTaskItem(new JSGantt.TaskItem(g,11,  'Chart Object',         '7/20/2008', '7/20/2008', '#ff00ff', 'http://www.yahoo.com', 1, 'Shlomy',  100, 0, 1, 1));
    g.AddTaskItem(new JSGantt.TaskItem(g,12,  'Task Objects',         '',          '',          '#00ff00', '', 0, 'Shlomy',   40, 1, 1, 1));
    g.AddTaskItem(new JSGantt.TaskItem(g,121, 'Constructor Proc',     '7/21/2008', '8/9/2008',  '#00ffff', 'http://www.yahoo.com', 0, 'Brian T.', 60, 0, 12, 1));
    g.AddTaskItem(new JSGantt.TaskItem(g,122, 'Task Variables',       '8/6/2008',  '8/11/2008', '#ff0000', 'http://help.com', 0, 'Brian',         60, 0, 12, 1,121));
    g.AddTaskItem(new JSGantt.TaskItem(g,123, 'Task by Minute/Hour',       '8/6/2008',  '8/11/2008 12:00', '#ffff00', 'http://help.com', 0, 'Ilan',         60, 0, 12, 1,121));
    g.AddTaskItem(new JSGantt.TaskItem(g,124, 'Task Functions',       '8/9/2008',  '8/29/2008', '#ff0000', 'http://help.com', 0, 'Anyone',   60, 0, 12, 1, 0, 'This is another caption'));
    g.AddTaskItem(new JSGantt.TaskItem(g,2,   'Create HTML Shell',    '8/24/2008', '8/25/2008', '#ffff00', 'http://help.com', 0, 'Brian',    20, 0, 0, 1,122));
    g.AddTaskItem(new JSGantt.TaskItem(g,3,   'Code Javascript',      '',          '',          '#ff0000', 'http://help.com', 0, 'Brian',     0, 1, 0, 1 ));
    g.AddTaskItem(new JSGantt.TaskItem(g,31,  'Define Variables',     '7/25/2008', '8/17/2008', '#ff00ff', 'http://help.com', 0, 'Brian',    30, 0, 3, 1, '','Caption 1'));
    g.AddTaskItem(new JSGantt.TaskItem(g,32,  'Calculate Chart Size', '8/15/2008', '8/24/2008', '#00ff00', 'http://help.com', 0, 'Shlomy',   40, 0, 3, 1));
    g.AddTaskItem(new JSGantt.TaskItem(g,33,  'Draw Taks Items',      '',          '',          '#00ff00', 'http://help.com', 0, 'Someone',  40, 1, 3, 1));
    g.AddTaskItem(new JSGantt.TaskItem(g,332, 'Task Label Table',     '8/6/2008',  '8/11/2008', '#0000ff', 'http://help.com', 0, 'Brian',    60, 0, 33, 1));
    g.AddTaskItem(new JSGantt.TaskItem(g,333, 'Task Scrolling Grid',  '8/9/2008',  '8/20/2008', '#0000ff', 'http://help.com', 0, 'Brian',    60, 0, 33, 1));
    g.AddTaskItem(new JSGantt.TaskItem(g,34,  'Draw Task Bars',       '',          '',          '#990000', 'http://help.com', 0, 'Anybody',  60, 1, 3, 0));
    g.AddTaskItem(new JSGantt.TaskItem(g,341, 'Loop each Task',       '8/26/2008', '9/11/2008', '#ff0000', 'http://help.com', 0, 'Brian',    60, 0, 34, 1));
    g.AddTaskItem(new JSGantt.TaskItem(g,342, 'Calculate Start/Stop', '9/12/2008', '10/18/2008', '#ff6666', 'http://help.com', 0, 'Brian',    60, 0, 34, 1));
    g.AddTaskItem(new JSGantt.TaskItem(g,343, 'Draw Task Div',        '10/13/2008', '10/17/2008', '#ff0000', 'http://help.com', 0, 'Brian',    60, 0, 34, 1));
    g.AddTaskItem(new JSGantt.TaskItem(g,344, 'Draw Completion Div',  '10/17/2008', '11/04/2008', '#ff0000', 'http://help.com', 0, 'Brian',    60, 0, 34, 1,"342,343"));
    g.AddTaskItem(new JSGantt.TaskItem(g,35,  'Make Updates',         '12/17/2008','2/04/2009','#f600f6', 'http://help.com', 0, 'Brian',    30, 0, 3,  1));

    g.Draw();	
    g.DrawDependencies();
   
    vm.submit = function() {
        vm.apiUrl = "https://" + vm.domain + "/rest/api/2/";

        credential = btoa(vm.userId + ":" + vm.password);
        
        if (vm.remember) {
            console.log("Setting local storage");
            localStorage.setItem(storageKey+".Domain", vm.domain);
            localStorage.setItem(storageKey+".Filter", vm.filterNumber);
            localStorage.setItem(storageKey+".Cred", credential);
        }
        else {
            console.log("Clearing local storage");
            localStorage.removeItem(storageKey+".Domain");
            localStorage.removeItem(storageKey+".Filter");
            localStorage.removeItem(storageKey+".Cred");
        }
        
        getTickets()
            .then(function successCallback(response) {
                vm.assignees = [];
                vm.workHours = [];

                // Each person can only work so many hours a day.
                var capacity = vm.availableHours * vm.daysRemaining;
                // How many are overworked?
                var atRisk = 0;
                
                // We want the bars in alphabetical order
                assignees = Object.keys(response).sort();
                for (var i = 0; i < assignees.length; ++i) {
                    var assignee = assignees[i];
                    var hours = response[assignee];
                    vm.assignees.push(assignee);
                    vm.workHours.push(hours);
                    if (hours >= capacity) {
                        atRisk++;
                    }
                }
                
                if (capacity == 0) {
                    vm.message = "";
                }
                else {
                    vm.message = "Work capacity is " +
                        capacity + " hours per person.";
                    if (atRisk) {
                        vm.message += "  " + atRisk +
                            (atRisk == 1 ? " is" : " are ") +
                            " at risk.";
                    }
                }
            }, function errorCallback(response) {
                console.log(response);
            });
        
    };

    var getAssignee = function(ticket) {
        // If undefined, null, or empty, return Unassigned
        if (!ticket.fields.assignee) {
            return "Unassigned";
        }
        else {
            return ticket.fields.assignee.displayName;
        }
    };

    var getRemainingHours = function(ticket) {
        if (!ticket.fields.timeestimate) {
            // If there is no estimate at all, default
            if (!ticket.fields.timeoriginalestimate) {
                return vm.defaultEstimateHours;
            }
            // There is no remaining estimate, but there is a current
            // estimate, scale it from seconds to hours
            else {
                return ticket.fields.timeoriginalestimate / 3600;
            }
        }
        else {
            // There is a remaining estimate, scale it from seconds to
            // hours.
            return ticket.fields.timeestimate / 3600;
        }
    };

    // Returns a promise.  When that promise is satisfied, the data
    // passed back is remaining estimate per assignee
    var getTickets = function(){
        var deferred = $q.defer();
        var workByAssignee = {};

        // If the API URL isn't yet defined, return an empty list.
        if (vm.apiUrl == undefined) {
            deferred.resolve(estimates);
        }
        
        $http({
            url: vm.apiUrl +
                "search?jql=filter=" +
                vm.filterNumber +
                "&maxResults=1000",
            method: "GET",
            headers: { "Authorization": "Basic " + credential }
        })
            // FIXME - handle paged data.  We're not done if
            // data.startAt + data..maxResults < data.total
            .then(function successCallback(response) {
                angular.forEach(response.data.issues, function(issue, index) {
                    var assignee = getAssignee(issue);
                    var hours = getRemainingHours(issue);
                    if (! workByAssignee.hasOwnProperty(assignee)) {
                        workByAssignee[assignee] = 0;
                    }
                    workByAssignee[assignee] += hours;
                });
                deferred.resolve(workByAssignee);
                
            }, function errorCallback(response) {
                // CORS is handled by the client but we want to pass
                // something back to the caller.
                if (response.status == 0 && response.statusText == "") {
                    response.status = 403;
                    response.statusText =
                        "Getting recent ticket data failed in a way" +
                        " that suggests a CORS issue.  See the README" +
                        " for notes about installing and configuring" +
                        " the Allow-Control-Allow-Origin plugin.";
                    alert(response.statusText);
                }
                deferred.reject(response);
            });

        return deferred.promise;
    };
});
