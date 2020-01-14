// TODO - consider adding radio buttons to allow viewing workload for
// a filter (as is), sprint, or epic

var app = angular.module('jiraworkload', ['chart.js', 'JiraService']);

// This only works if you
// * install
// https://chrome.google.com/webstore/detail/allow-control-allow-origi/nlfbmbojpeacfghkpbjhddihlkkiljbi?hl=en
// * enable it
// * configure it to intercept https://<yourJiraRoot>/rest/api/*
app.config(function($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
});

app.controller('MainCtrl', function($window, $http, $q, $location, Jira) {
    document.title = "Jira Workload";
    var headlines = document.getElementsByTagName("h1");
    if (headlines.length > 0) {
        headlines[0].innerText = document.title;
    }

    vm = this;

    var parameters = [
        // Your Jira server's domain like "yourCompany.atlassian.net" or
        // "jira.yourCompany.local".  "https://" is assumed and added by
        // the code when building a request.
        //
        // The default is blank when loading from the file system but that's OK.
        { name: 'domain', default: window.location.hostname },
        
        // Default estimate for unestimated issues.  Better than 0 but
        // not really experience-based.
        { name: 'defaultEstimateHours', query: 'dftest', default: 8 },
        
        // Available hours per day (per developer) after meetings,
        // unscheduled maintenance, etc.
        { name: 'availableHours', query: 'avail', default: 5 },
        
        // Number of days remaining to finish work
        { name: 'daysRemaining', query: 'days', default: 1 },
        
        // Query text.  JQL as in an issue search
        { name: 'queryText', query: 'q', default: '' },
        
        { name: 'credential', default: '' }
    ];

    var storageKey = "jiraWorkload";

    var query = $location.search();

    // If we found values, it's because the user wanted last time
    // to remember them so set remember true now, too.
    vm.remember = paramLib.loadParameters(storageKey, parameters, vm, query);
    if (vm.credential.length != 0) {
        var parts = atob(vm.credential).split(":");
        vm.userId = parts[0];
        vm.password = parts[1]
    }
    else {
        vm.userId = '';
        vm.password = '';
    }

    // Interaction with the chart is by index.  We display the
    // assignee display names (e.g., "Mickey Mouse") and assigned
    // hours.
    vm.assigneeNames = [];
    vm.workHours = [];

    // In the click handler, we get the index but want to be able to
    // look up the Jira username/ID (e.g., "mmouse") so we build an
    // array of IDs in the same order as we populate the chart data.
    var assigneeIds = [];

    // Based on https://stackoverflow.com/questions/36329630 to add
    // capacity line.  scale suggestedMax and annotation value are
    // replaced when the data is loaded.
    vm.chartOptions = {
        scales: {
            yAxes: [{
                ticks: {
                    suggestedMax: 100
                }
            }]
        },
        annotation: {
            annotations: [
                {
                    type: "line",
                    mode: "horizontal",
                    scaleID: "y-axis-0",
                    value: "50",
                    borderColor: "red",
                }
            ]
        }
    };
    
    vm.submit = function() {
        vm.message = "";
        vm.apiUrl = "https://" + vm.domain + "/rest/api/2/";

        vm.credential = btoa(vm.userId + ":" + vm.password);

        Jira.config(vm.domain, vm.credential);
        
        // Update URL
        paramLib.processQueryParameters(parameters, vm,
                                        $location.search.bind($location));

        // Set or clear local storage
        if (vm.remember) {
            paramLib.saveParameters(storageKey, parameters, vm);
        }
        else {
            paramLib.clearParameters(storageKey, parameters);
        }
        
        // Clear any data from previous submissions
        vm.assigneeNames = [];
        vm.workHours = [];
        assigneeIds = [];
        
        Jira.getIssues(vm.queryText)
            .then(function successCallback(issues) {
                var estimates = issues.map(estimateFromIssue);
                                
                // A hash indexed by display name.  Each element
                // summarizes the work for that assignee.
                var workByAssignee = {};

                angular.forEach(estimates, function(e, index) {
                    if (!workByAssignee.hasOwnProperty(e.assigneeName)) {
                        workByAssignee[e.assigneeName] = {
                            hours: 0,
                            issues: 0,
                            id: e.assigneeId
                        };
                    }
                    workByAssignee[e.assigneeName].hours += e.hours;
                    workByAssignee[e.assigneeName].issues++;
                });

                // We want the bars in alphabetical order
                var sortedNames = Object.keys(workByAssignee).sort();
                // "Name" label will include issue count.
                vm.assigneeNames = sortedNames.map(
                    function(k) { return k +
                                  " (" + workByAssignee[k].issues + ")"; });
                // The height of the bar is hours.
                vm.workHours = sortedNames.map(
                    function(k) { return workByAssignee[k].hours; });
                // Keep track of IDs in the same order so we can
                // process clicks.
                assigneeIds = sortedNames.map(
                    function(k) { return workByAssignee[k].id; });

                
                // Each person can only work so many hours a day.
                // Zero means "don't show capacity and overwork."
                var capacity = vm.availableHours * vm.daysRemaining;

                // Set the level of the capacity line
                vm.chartOptions.annotation.annotations[0].value = capacity;
                // Suggest that the Y axis be 10% taller than capacity
                vm.chartOptions.scales.yAxes[0].ticks.suggestedMax =
                    capacity * 1.1;
                
                if (capacity == 0) {
                    vm.message = "";
                }
                else {
                    vm.message = "Work capacity is " +
                        capacity + " hours per person.";
                    
                    // How many are overworked?
                    var atRisk = Object.keys(workByAssignee)
                        .filter(key => workByAssignee[key].hours > capacity)
                        .length;

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

    vm.onChartClick = function(points, evt) {
        var index;
        // If the user clicked a bar, the chart tells us which
        if (points.length > 0 && points[0].hasOwnProperty("_index")) {
            // Which bar was clicked on that chart?
            index = points[0]._index;
        }
        // If the user clicked outside a bar, we need to figure it out
        else {
            var width = this.chart.chart.scales['x-axis-0'].width;
            var count = this.chart.scales['x-axis-0'].ticks.length;
            var padding_left = this.chart.scales['x-axis-0'].paddingLeft;
            var padding_right = this.chart.scales['x-axis-0'].paddingRight;
            var xwidth = (width-padding_left-padding_right)/count;

            var xoffset = evt.clientX - this.chart.chartArea.left;

            // Which bar does this offset correspond to?
            index = Math.floor(xoffset/xwidth);

            // If outside the bar area, there's nothing to do.
            if (index < 0 || index > count) {
                return;
            }
        }
        
        // The base URL: matches filter for the chart
        // AND limited by assignee
        var url = "https://" + vm.domain + "/issues/"
            + "?jql=" + vm.queryText
            + " AND assignee";

        // Look up the ID
        var id = assigneeIds[index];
        // Add the rest of the assignee clause
        if (id == "unassigned") {
            url += " is empty";
        } else {
            url += "="+id;
        }
        // TODO - add ordering?
        
        $window.open(url);
    }

    var estimateFromIssue = function(issue) {
        var assignee = getAssignee(issue);
        return {
            assigneeId : assignee.id,
            assigneeName : assignee.name,
            hours : getRemainingHours(issue)
        };
    }
        
    var getAssignee = function(issue) {
        // If undefined, null, or empty, return Unassigned
        if (!issue.fields.assignee) {
            return {
                name: "Unassigned",
                id: "unassigned"
            };
        }
        else {
            return {
                name: issue.fields.assignee.displayName,
                id: issue.fields.assignee.name
            };
        }
    };

    var getRemainingHours = function(issue) {
        if (issue.fields.timeestimate == null) {
            // If there is no estimate at all, default
            if (!issue.fields.timeoriginalestimate) {
                return vm.defaultEstimateHours;
            }
            // There is no remaining estimate, but there is a current
            // estimate, scale it from seconds to hours
            else {
                return issue.fields.timeoriginalestimate / 3600;
            }
        }
        else {
            // There is a remaining estimate, scale it from seconds to
            // hours.
            return issue.fields.timeestimate / 3600;
        }
    };

    vm.submit();
});
