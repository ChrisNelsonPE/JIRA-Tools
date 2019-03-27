var app = angular.module('jiraworkloadproj', ['chart.js']);

// Show workload by release.  (Jira is a bit inconsistent with
// "release" vs. "fixVersion" but there is a one-to-one
// correspondence.)
//
// Each assignee has the same color bar across all the charts.
//
// The workload charts are shown in cronological order by the
// release's Release Date.
// FUTURE - use Start Date if Release Date isn't set.
//
// Optionally, each successive chart can rollup all the work for
// previous releases so it shows *all* the work due by that date.

// FUTURE - might be nice to have a chart per owner with the bar being
// releases.

// NOTE: This uses the Jira API and can have issues with CORS because
// Jira ignores preflight checks.
//
// For Jira Server, you can add
//
//    <Context docBase="/opt/jiratools" path="/static" />
//
// to the Host section of server.xml in your Jira configuation where
// "/opt/jiratools" is where this app resides.  (Courtesy of
// https://www.moreofless.co.uk/static-content-web-pages-images-tomcat-outside-war/
//
// For Jira Cloud (or if you won't want to modify your Jira config),
// you have to load the app from the local file system, and
//
// * install
// https://chrome.google.com/webstore/detail/allow-control-allow-origi/nlfbmbojpeacfghkpbjhddihlkkiljbi?hl=en
// * enable it
// * configure it to intercept https://<yourJiraRoot>/rest/api/*
app.config(function($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
});

app.controller('MainCtrl', function($window, $http, $q, $location) {
    document.title = "Jira Projected Workload";
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
        
        { name: 'projects', query: 'proj', default: '' },
        { name: 'limitToGroup', query: 'ltg', default: false },
        { name: 'group', query: 'group', default: '' },
        
        // Default estimate for unestimated tickets.  Better than 0 but
        // not really experience-based.
        { name: 'defaultEstimateHours', query: 'dftest', default: 8 },
        
        // Available hours per day (per developer) after meetings,
        // unscheduled maintenance, etc.
        { name: 'availableHours', query: 'avail', default: 5 },
        
        // Does each workload chart include all the preceeding releases
        { name: 'cumulative', query: 'cum', default: false },
        
        // Do releases with the same release date get grouped on the same chart
        { name: 'groupByDate', query: 'gbd', default: false },
        
        // Does the last workload chart include issues without a fixVersion
        { name: 'includeUnscheduled', query: 'inun', default: false },
        { name: 'credential', default: '' }
    ];

    var storageKey = "jiraWorkloadProj";

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

    // FUTURE - it would be nice to use pattern, too.  See
    // https://www.chartjs.org/docs/latest/general/colors.html section
    // on Patterns.
    var colors = [
        // Shades of Auto/Mate yellow from
        // https://www.w3schools.com/colors/colors_picker.asp
        "#fdd79b",
        "#fcc469",
        "#fbb037",
        "#fa9c05",
        "#c87d04",
        "#965e03",
        "#643e02",
        "#4b2f02",
        "#321f01",
        "#191001"
        // Some pure colors
        // "#ff0000",
        // "#ffff00",
        // "#00ff00",
        // "#00ffff",
        // "#0000ff",
        // "#ff00ff",
        // "#ff8888",
        // "#ffff88",
        // "#88ff88",
        // "#88ffff",
        // "#8888ff",
        // "#ff88ff",
    ];

    // Preserves color assignments across charts
    var colorByAssignee = {};


    // Return an array of releases for all the listed projects
    var getReleases = function(projectNames) {
        var deferred = $q.defer();
        Promise.all(projectNames.map(function(projectName) {
            return getProjectReleases(projectName);
        })).then(function successCallback(results) {
            var releases = [];
            for (var i = 0; i < results.length; ++i) {
                releases = releases.concat(results[i]);
            }
            deferred.resolve(releases);
        });
        return deferred.promise;
    };
    
    var getProjectReleases = function(projectName) {
        var deferred = $q.defer();
        var url = "https://" + vm.domain + "/rest/api/2/";
        url += 'project/' + projectName + '/versions';
        $http({
            url: url,
            method: 'GET',
            headers: { "Authorization": "Basic " + vm.credential }
        })
            .then(function successCallback(response) {
                deferred.resolve(response.data.filter(
                    r => !r.released && !r.archived));
            }, function errorCallback(response) {
                // CORS is handled by the client but we want to pass
                // something back to the caller.
                if (response.status == 0 && response.statusText == "") {
                    response.status = 403;
                    response.statusText =
                        "Getting project releases failed in a way" +
                        " that suggests a CORS issue.  See the README" +
                        " for notes about installing and configuring" +
                        " the Allow-Control-Allow-Origin plugin.";
                    alert(response.statusText);
                }
                deferred.reject(response);
            });
        return deferred.promise;
    };

    var processReleases = function(releases) {
        // Names of releases for the chart
        var chartReleases = [];

        // Sort releases by date, then name.
        var sortedReleases = releases.sort(function(r1, r2) {
            if (r1.hasOwnProperty("releaseDate")
                && !r2.hasOwnProperty("releaseDate")) return -1;
            if (!r1.hasOwnProperty("releaseDate")
                && r2.hasOwnProperty("releaseDate")) return 1;
            
            if (r1.releaseDate < r2.releaseDate) return -1;
            if (r1.releaseDate > r2.releaseDate) return 1;
            
            return r1.name.localeCompare(r2.name);
        });

        // Each element is an array of releases.  Index is by chart.
        // vm.releases[i] is
        //  * a list with a single release (if group by release is false)
        //  * all the releases on a date (if group by release is true)
        // This is different from chartReleases which is
        //  * vm.releases[i] (if cumulative is false)
        //  * the concatenation of all vm.release[j] for j <= i (if
        //    cumulative is true)
        vm.releases = [];
        
        var previousDate = "";
        for (var i = 0; i < sortedReleases.length; ++i) {
            var r = sortedReleases[i];

            // This release has a new date, or we're not grouping by
            // date, put this release in a new chart
            if (r.releaseDate != previousDate || !vm.groupByDate) {
                vm.releases.push([ r ]);
            }
            // Otherwise (the same date and grouping by date) add it
            // to the current chart
            else {
                vm.releases[vm.releases.length-1].push(r);
            }
            previousDate = r.releaseDate;
        }

        for (var i = 0; i < vm.releases.length; ++i) {
            if (vm.cumulative) {
                chartReleases = chartReleases.concat(vm.releases[i]);
            }
            else {
                chartReleases = vm.releases[i];
            }

            var releaseDate = vm.releases[i][0].releaseDate;

            // TODO - get data in one function, build charts in another
            // That allows us to get data once, not once per chart
            // and allows per-user charts
            
            getOneChart(chartReleases, i, releaseDate);
        }
    };

    var getOneChart = function(releases, chartNum, releaseDateStr) {
        var capacity = 0;
        if (releaseDateStr === undefined) {
            releaseDateStr = "No due date";
        }
        else {
            // This is likely off by GMT offset but it's close enough
            // for now.
            var releaseDate = Date.parse(releaseDateStr + 'T00:00:00Z');
            var today = Date.now();
            var daysRemaining = (releaseDate - today) / (24 * 60 * 60 * 1000);
            // Work days
            daysRemaining = (daysRemaining / 7) * 5;
            capacity = daysRemaining * vm.availableHours;

            releaseDateStr = new Date(releaseDate).toISOString().substring(0, 10);
        }
        
        var chart = {
            releaseDate : releaseDateStr,
            query : "",
            // Interaction with the chart is by index.  We display the
            // assignee display names (e.g., "Mickey Mouse") and
            // assigned hours.
            assigneeNames : [],
            // In the click handler, we get the index but want to be
            // able to look up the Jira username/ID (e.g., "mmouse")
            // so we build an array of IDs in the same order as we
            // populate the chart data.
            assigneeIds : [],
            workHours : [],
            colors : [],
            // Based on https://stackoverflow.com/questions/36329630
            // to add capacity line.  scale suggestedMax and
            // annotation value are replaced when the data is loaded.
            options : {
                scales: {
                    xAxes: [{ ticks: { autoSkip: false }}],
                    yAxes: [{ ticks: { suggestedMin: 0, suggestedMax: 100 }}]
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
            }
        };
        
        var releaseNames  = releases.map(function(r) {
            return r.name;
        });
            

        // Always include the issues with fixVersion in the release list
        var fixVersionClause = "fixVersion in ("
            + "\"" + releaseNames.join('","') + "\""
            + ")";

        // Include issues without a fixVersion in the last chart.
        // This relies on vm.projects being well formed but we've used
        // it already above so that's likely safe.
        if (releaseDate == null && vm.includeUnscheduled) {
            fixVersionClause = "("
                + fixVersionClause
                + " OR fixVersion IS EMPTY"
                + " AND project IN (" + vm.projects + ")"
                + ")";
        }

        query = "jql=" + fixVersionClause
        query += " AND statusCategory != Done";
        if (vm.limitToGroup && vm.group.length > 0) {
            query += " AND (assignee IN membersOf(" + vm.group + ")"
	        + " OR assignee IS Empty)";
        }

        chart.query = query;

        getTickets(query)
            .then(function successCallback(tickets) {
                var estimates = tickets.map(estimateFromTicket);
                
                // A hash indexed by display name.  Each element
                // summarizes the work for that assignee.
                var workByAssignee = {};

                angular.forEach(estimates, function(e, index) {
                    if (!workByAssignee.hasOwnProperty(e.assigneeName)) {
                        workByAssignee[e.assigneeName] = {
                            hours: 0,
                            tickets: 0,
                            id: e.assigneeId
                        };
                    }
                    workByAssignee[e.assigneeName].hours += e.hours;
                    workByAssignee[e.assigneeName].tickets++;
                });

                // We want the bars in alphabetical order
                var sortedNames = Object.keys(workByAssignee).sort();
                // "Name" label will include ticket count.
                chart.assigneeNames = sortedNames.map(
                    function(k) { return k +
                                  " (" + workByAssignee[k].tickets + ")"; });
                
                // The height of the bar is hours.
                chart.workHours = sortedNames.map(
                    function(k) { return workByAssignee[k].hours; });
                
                // Keep track of IDs in the same order so we can
                // process clicks.
                chart.assigneeIds = sortedNames.map(
                    function(k) { return workByAssignee[k].id; });
                
                chart.colors = sortedNames.map(
                    function(k) {
                        if (! (k in colorByAssignee)) {
                            if (colors.length > 0) {
                                colorByAssignee[k] = colors.shift();
                            }
                        }
                        return colorByAssignee[k];
                    });

                if (capacity > 0) {
                    // Set the level of the capacity line
                    chart.options.annotation.annotations[0].value = capacity;
                    // Suggest that the Y axis be 10% taller than capacity
                    chart.options.scales.yAxes[0].ticks.suggestedMax =
                        capacity * 1.1;
                }
                else {
                    chart.options = {};
                }

                vm.charts[chartNum] = chart;
                
            }, function errorCallback(response) {
                console.log(response);
            });
    };

    vm.interlock = function() {
        if (!vm.groupByDate) {
            vm.cumulative = false;
        }
    }

    vm.submit = function() {
        vm.apiUrl = "https://" + vm.domain + "/rest/api/2/";

        vm.credential = btoa(vm.userId + ":" + vm.password);

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
        vm.charts = [];

        // Split the projects list string into an array
        var projects = vm.projects.split(',').map(function(p) {
            return p.trim();
        });

        // Get the open releases for each project
        getReleases(projects)
            .then(function successCallBack(releases) {
                processReleases(releases);
        }, function errorCallback(response) {
            console.log("Error retrieving releases");
            alert(response.data.errorMessages[0]);
        });
    };

    vm.onDateClick = function(chartNum) {
        var url = "https://" + vm.domain + "/issues/"
            + "?" + vm.charts[chartNum].query
            + " ORDER BY fixVersion ASC";
        $window.open(url);
    };

    vm.onReleaseClick = function(releaseName) {
        var url = 'https://' + vm.domain + '/issues/'
            + '?jql=fixVersion="' + releaseName + '"';
        $window.open(url);
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
        
        // Which chart was clicked?
        var htmlId = evt.currentTarget.id;
        var chartNum = parseInt(htmlId.split('-')[1]);

        // The base URL: matches filter for the chart
        // AND limited by assignee
        var url = "https://" + vm.domain + "/issues/"
            + "?" + vm.charts[chartNum].query
            + " AND assignee";
        
        var id = vm.charts[chartNum].assigneeIds[index];
        // Add the rest of the assignee clause
        if (id == "unassigned") {
            url += " is empty";
        } else {
            url += "="+id;
        }
        url += " ORDER BY fixVersion ASC"
        
        $window.open(url);
    }

    var estimateFromTicket = function(ticket) {
        var assignee = getAssignee(ticket);
        return {
            assigneeId : assignee.id,
            assigneeName : assignee.name,
            hours : getRemainingHours(ticket)
        };
    }
        
    var getAssignee = function(ticket) {
        // If undefined, null, or empty, return Unassigned
        if (!ticket.fields.assignee) {
            return {
                name: "Unassigned",
                id: "unassigned"
            };
        }
        else {
            return {
                name: ticket.fields.assignee.displayName,
                id: ticket.fields.assignee.name
            };
        }
    };

    var getRemainingHours = function(ticket) {
        if (ticket.fields.timeestimate == null) {
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
    // passed back a list of tickets matching the Jira filter.
    var getTickets = function(query){
        var deferred = $q.defer();

        var url = "https://" + vm.domain + "/rest/api/2/";
        url += "search?" + query;
        url += "&maxResults=1000";
        
        $http({
            url: url,
            method: "GET",
            headers: { "Authorization": "Basic " + vm.credential }
        })
            // FUTURE - handle paged data.  We're not done if
            // data.startAt + data..maxResults < data.total Asking for
            // 1000 results, above, gets around this for now.
            .then(function successCallback(response) {
                deferred.resolve(response.data.issues);
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
