var app = angular.module('jiraworkloadproj', ['chart.js', 'JiraService']);

// Show workload by release.  (Jira is a bit inconsistent with
// "release" vs. "fixVersion" but there is a one-to-one
// correspondence.)
//
// Each bar has the same color bar across all the charts.
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

app.controller('MainCtrl', function($window, $http, $q, $location, Jira) {
    document.title = "Jira Projected Workload";
    var headlines = document.getElementsByTagName("h1");
    if (headlines.length > 0) {
        headlines[0].innerText = document.title;
    }

    vm = this;

    // Tell the service about the custom fields we use.
    Jira.customFields({ "points" : "customfield_10002" });

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

        { name: 'barCategory', query: 'cat', default: 'assignee' },

        { name: 'unit', query: 'unit', default: 'hour'},
        
        // Default estimate for unestimated issues.  Better than 0 but
        // not really experience-based.
        { name: 'defaultEstimate', query: 'dftest', default: 8 },
        
        // Expected units per day (per developer) after meetings,
        // unscheduled maintenance, etc.
        { name: 'burnRate', query: 'rate', default: 5 },
        
        // Does each workload chart include all the preceeding releases
        { name: 'cumulative', query: 'cum', default: false },
        
        // Do releases with the same release date get grouped on the same chart
        { name: 'groupByDate', query: 'gbd', default: false },
        
        // Does the last workload chart include issues without a fixVersion
        { name: 'includeUnscheduled', query: 'inun', default: false },
        { name: 'credential', default: '' }
    ];

    vm.units = [ "hour", "point" ];

    vm.categories = [ 'assignee', 'project', 'type', 'status' ];

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

    var colors = [];
    var colorByLabel = {};
    
    var resetColors = function() {
        // FUTURE - it would be nice to use pattern, too.  See
        // https://www.chartjs.org/docs/latest/general/colors.html section
        // on Patterns.
        colors = [
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
        colorByLabel = {};
    }

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

    var buildOneChart = function(workByCategory, releaseDateStr) {
        var capacity = 0;
        if (releaseDateStr === undefined) {
            releaseDateStr = "No due date";
        }
        // FIXME - this clause is the only reference to vm in this function.
        else if (vm.barCategory == 'assignee') {
            // This is likely off by GMT offset but it's close enough
            // for now.
            var releaseDate = Date.parse(releaseDateStr + 'T00:00:00Z');
            var today = Date.now();
            // TODO - for non-cumulative charts, use 2 weeks (14 days)
            var daysRemaining = (releaseDate - today) / (24 * 60 * 60 * 1000);
            // Work days
            daysRemaining = (daysRemaining / 7) * 5;
            capacity = daysRemaining * vm.burnRate;
        }
        
        var chart = {
            releaseDate : releaseDateStr,
            // In the click handler, we get the index but want to be
            // able to look up the Jira username/ID (e.g., "mmouse")
            // so we build an array of IDs in the same order as we
            // populate the chart data.
            filters : [],
            work : [],
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

        // Sort the labels by the specified order
        var sortedLabels = Object.keys(workByCategory).sort(function(k1, k2) {
            var o1 = workByCategory[k1];
            var o2 = workByCategory[k2];
            if (o1.order < o2.order) {
                return -1;
            }
            else if (o1.order > o2.order) {
                return 1;
            }
            else {
                return 0;
            }});
        
        // Label will include issue count.
        chart.barLabels = sortedLabels.map(
            function(k) { return k +
                          " (" + workByCategory[k].issues + ")"; });
        
        // The height of the bar is hours.
        chart.work = sortedLabels.map(
            function(k) { return workByCategory[k].work; });

        chart.totalWork = chart.work.reduce((a,b) => a+b, 0).toFixed(2);

        chart.totalIssues =
            Object.values(workByCategory).reduce((t, n) => t + n.issues, 0);

        // Keep track of IDs in the same order so we can
        // process clicks.
        chart.filters = sortedLabels.map(
            function(k) { return workByCategory[k].filter; });
        
        chart.colors = sortedLabels.map(
            function(k) {
                if (! (k in colorByLabel)) {
                    if (colors.length > 0) {
                        colorByLabel[k] = colors.shift();
                    }
                }
                return colorByLabel[k];
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
        
        return chart;
    };

    var getOneChart = function(releases, chartNum, releaseDateStr) {
        var options = {
            includeUnscheduled: vm.includeUnscheduled
                && (releaseDateStr == null),
            projects: vm.projects,
            limitToGroup: vm.limitToGroup,
            group: vm.group
        };
        
        Jira.getReleaseIssues(options, releases)
            .then(function successCallback(issues) {
                var estimates = issues.map(estimateFromIssue);
                
                // A hash indexed by display name.  Each element
                // summarizes the work for that category.
                var workByCategory = {};

                angular.forEach(estimates, function(e, index) {
                    if (!workByCategory.hasOwnProperty(e.category)) {
                        workByCategory[e.category] = {
                            work: 0,
                            issues: 0,
                            filter: e.filter,
                            order: e.order
                        };
                    }
                    workByCategory[e.category].work += e.work;
                    workByCategory[e.category].issues++;
                });

                vm.charts[chartNum] = buildOneChart(workByCategory,
                                                    releaseDateStr);
                vm.charts[chartNum].query = query;
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
        vm.charts = [];
        resetColors();

        // Get the open releases for each project
        Jira.getProjectReleases(vm.projects)
            .then(function successCallBack(releases) {
                processReleases(releases);
        }, function errorCallback(response) {
            console.log("Error retrieving releases");
            alert(response.data.errorMessages[0]);
        });
    };

    vm.onDateClick = function(chartNum) {
        var url = "https://" + vm.domain + "/issues/"
            + "?jql=" + vm.charts[chartNum].query
            + " ORDER BY fixVersion ASC, priority DESC";
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
        var url = "https://" + vm.domain + "/issues/"
            + "?jql=" + vm.charts[chartNum].query;

        // Add a bar-specific filter clause
        url += " AND " + vm.charts[chartNum].filters[index];
        
        url += " ORDER BY fixVersion ASC, priority DESC"
        
        $window.open(url);
    }

    var statusOrder = [
        'Backlog',
        'New',
        'Ready',
        'In Progress',
        'Code Review Failed',
        'Code Review',
        'Code Review Passed',
        'Dev QA',
        'QA',
        'QA Passed'
    ];

    var getStatus = function(issue) {
        var status = {
            name : issue.fields.status.name
        }
        
        var index = statusOrder.indexOf(status.name);
        status.order = index != -1 ? index : statusOrder.length;

        return status;
    };

    // An estimate has four fields built from the issue
    // * work - the remaining work in the issue
    // * category - the label for the bar it will be displayed on
    // * filter - a JQL filter clause which limits the chart filter to
    //            the bar's issues.
    // * order - the order that the bar should be displsyed in
    var estimateFromIssue = function(issue) {
        var estimate = {
            work : getRemainingWork(issue),
        };

        switch (vm.barCategory) {
        case 'assignee':
        default:
            var assignee = getAssignee(issue);
            estimate.category = assignee.name;
            estimate.filter = assignee.id == "unassigned"
                ? "assignee is empty"
                : "assignee = " + assignee.id;
            estimate.order = assignee.name;
            break;
        case 'project':
            estimate.category = issue.fields.project.name;
            estimate.filter = "project = " + issue.fields.project.key;
            estimate.order = issue.fields.project.name;
            break;
        case 'type':
            estimate.category = issue.fields.issuetype.name;
            estimate.filter = 'type = "' + issue.fields.issuetype.name + '"';
            estimate.order = issue.fields.issuetype.name;
            break;
        case 'status':
            var status = getStatus(issue);
            estimate.category = status.name;
            estimate.filter = 'status = "' + status.name + '"';
            estimate.order = status.order;
            break;
        }

        return estimate;
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

    var getRemainingWork = function(issue) {
        if (vm.unit == "point") {
            return Jira.fieldValue(issue, "points", 0);
        }
        
        if (issue.fields.timeestimate == null) {
            // If there is no estimate at all, default
            if (!issue.fields.timeoriginalestimate) {
                return vm.defaultEstimate;
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
