var app = angular.module('jiragantt', []);

// This only works if you
// * install
// https://chrome.google.com/webstore/detail/allow-control-allow-origi/nlfbmbojpeacfghkpbjhddihlkkiljbi?hl=en
// * enable it
// * configure it to intercept https://<yourJiraRoot>/rest/api/*
app.config(function($httpProvider) {
    $httpProvider.defaults.useXDomain = true;
});

app.controller('MainCtrl', function($http, $q) {
    document.title = "Jira Gantt";

    vm = this;
    // Your Jira server's domain like "yourCompany.atlassian.net" or
    // "jira.yourCompany.local".  "https://" is assumed and added by
    // the code when building a request.
    vm.domain = ""

    // FUTURE - this should be retrieved from the server
    var epicLinkField = "customfield_10006";

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

    var credential = localStorage.getItem(storageKey+".Cred");
    if (credential != null) {
        var parts = atob(credential).split(":");
        vm.userId = parts[0];
        vm.password = parts[1]
        // If we found credentials, it's because the user wanted last time
        // to remember them so set remember true now, too.
        vm.remember = true;
    }

    var taskResource = function(ticket) {
        if (ticket.fields.assignee) {
            return ticket.fields.assignee.displayName;
        }
        else {
            return "Unassigned";
        }
    };
    
    // TODO - get from type, resource, or something
    var taskColor = function(ticket) {
        return "Skyblue";
    };

    var taskGetWork = function(ticket) {
        var remainingHours = getRemainingHours(ticket);
        var workedHours = 0;
        if (ticket.fields.timespent) {
            workedHours = ticket.fields.timespent / 3600;
        }
        
        return [workedHours, remainingHours];
    };

    // Update these to reflect local Jira config.
    var predecessorLinkText = "is blocked by";
    var parentLinkTexts = ["is a task in the story", "is a subtask of"];

    // An unused ID
    var noParent = 0;

    var taskDependencies = function(ticket) {
        var blocks = new Set([]);   // Predecssors
        var blocking = new Set([]); // Successors
        var parent = noParent; 
        var children = new Set([]);
        
        // Process Jira built-in subtasks
        if (ticket.fields.parent) {
            parent = parseInt(ticket.fields.parent.id);
        }
        
        if (ticket.fields.subtasks) {
            angular.forEach(ticket.fields.subtasks, function(subtask) {
                children.add(parseInt(subtask.id));
            });
        }
        
        // Process issue links to find adjacent tasks
        var links = ticket.fields.issuelinks;
        if (links) {
            for (var i= 0; i < links.length; ++i) {
                var link = links[i];
                if (link.inwardIssue) {
                    if (link.type.inward == predecessorLinkText) {
                        blocks.add(parseInt(link.inwardIssue.id));
                    }
                    else if (parentLinkTexts.indexOf(link.type.inward) > -1) {
                        var linkParent = parseInt(link.inwardIssue.id);
                        // If parent hasn't been set yet, set it.
                        if (parent == noParent) {
                            parent = linkParent;
                        }
                        // If it has been set, log a message.
                        else {
                            // If there is a conflict, ignore the link.
                            if (parent != linkParent) {
                                console.log(ticket.key + " parent (" +
                                            parent + ") conflicts with " +
                                            link.type.inward + " value " +
                                            linkParent + ". Ignoring " +
                                            link.type.inward);
                            }
                            // If they are the same, there's nothing to do.
                            else {
                                console.log(ticket.key + " has both " +
                                            "task/subtask relationship " +
                                            "and " + link.type.inward +
                                            "link.");
                            }
                        }
                    }
                    else {
                        console.log("Found another inward link type, '"
                                    + link.type.inward + "'");
                    }
                }
                else if (link.outwardIssue) {
                    // This tests for the inward text to simplify config.
                    if (link.type.inward == predecessorLinkText) {
                        blocking.add(parseInt(link.outwardIssue.id));
                    }
                    else if (parentLinkTexts.indexOf(link.type.inward) > -1) {
                        children.add(parseInt(link.outwardIssue.id));
                    }
                    else {
                        console.log("Found another outward link type, '"
                                    + link.type.inward + "'");
                    }
                }
            }
        }
        return [blocks, parent, children, blocking];
    };

    Object.filter = (obj, predicate) => 
        Object.keys(obj)
          .filter( key => predicate(obj[key]) )
          .reduce( (res, key) => (res[key] = obj[key], res), {} );

    // Visit in WBS order (a Depth-first search).  Order is not
    // considered at each level.
    //
    // tasks - a hash of tasks indexed by id.
    // visitor - a function to be applied to each id in WBS order.
    //   It is passed the hash and the key (id) to operate on.
    var wbsVisit = function(tasks, visitor) {
        var roots = Object.filter(tasks, task => task.parent == noParent);
        var queue = Object.keys(roots);
        while (queue.length != 0) {
            // Remove the key at the head of the queue
            key = queue.shift()
            // Add this task's children to the front of the queue
            queue = Array.from(tasks[key].children).concat(queue);
            // Execute the visitor function on the current task
            visitor(tasks, key);
        }
    };

    var taskType = function(ticket) {
        var typeValues = {
            "Bug" : 0,
            "Task" : 1
        };

        var type = typeValues[ticket.fields.issuetype.name];
        if (!type) {
            type = 100;
        }

        return type;
    };

    var taskPriority = function(ticket) {
        var priorityValues = {
            "Blocker" : 0,
            "Critical" : 1,
            "Major" : 2,
            "Normal" : 3,
            "Minor" : 4,
            "Trivial" : 5
        };

        var priority = priorityValues[ticket.fields.priority.name];
        if (!priority) {
            priority = 100;
        }

        return priority;
    };

    var taskFromTicket = function(ticket) {
        var task = {};
        // Simple stuff
        task.id = parseInt(ticket.id);
        task.name = ticket.key + ":" + ticket.fields.summary;
        task.key = ticket.key;

        // ticket.self is an API link.
        task.link = "https://" + vm.domain
            + "/browse/"+ task.key
            + "?filter="+ vm.filterNumber;
        
        task.milestone = false; // Don't have milestones in Jira

        // Some computed/dependent stuff
        task.display = taskColor(ticket);
        task.type = taskType(ticket);
        task.priority = taskPriority(ticket);
        // FUTURE - Process status.  For example, we might prioritize
        // failed build over new development.

        task.resource = taskResource(ticket);
        [task.blocks, task.parent, task.children, task.blocking] =
            taskDependencies(ticket);

        // If there are children, ignore time from Jira, it will roll
        // up from children
        if (task.children.size) {
            task.workedHours = 0;
            task.remainingHours = 0;
        }
        else {
            [task.workedHours, task.remainingHours] = taskGetWork(ticket);
        }
        task.durationHours = task.workedHours + task.remainingHours;

        task.epic = ticket.fields[epicLinkField];

        return task;
    };

    var hashFromArray = function(arr, key) {
        var hash = {};
        for (var i = 0; i < arr.length; ++i) {
            hash[arr[i][key]] = arr[i];
        }
        return hash;
    };

    // Look up epic keys to get IDs.  This has to be a post-processing step
    // because tasks may not include the epic as task is first converted.
    var resolveEpics = function(tasks) {
        angular.forEach(tasks, function(task) {
            // If the task has no parent but has an epic, try to find
            // the id for the epic in the list of tasks.
            if (task.parent == noParent && task.epic != "") {
                angular.forEach(tasks, function(t) {
                    if (t.key == task.epic) {
                        task.parent = t.id;
                        t.children.add(task.id);
                    }
                });
            }
        });
    };

    // Remove links to tasks that aren't in the list
    var pruneLinks = function(tasks) {
        var linkTypes = ["blocking", "blocks", "children"];
        angular.forEach(tasks, function(task) {
            // If parent is set but isn't in the list, remove it from
            // the task.
            if (task.parent != noParent && !tasks[task.parent]) {
                task.parent = noParent;
            }

            // Filter each list of links for this task and keep only
            // those in the overall task list.
            angular.forEach(linkTypes, function(linkType) {
                var pruned = new Set([]);
                task[linkType].forEach(function(id) {
                    if (tasks[id]) {
                        pruned.add(id);
                    }
                });
                task[linkType] = pruned;
            });
        });
    };

    // Decorate tasks to make schedling easier
    var preSchedule = function(tasks) {
        angular.forEach(tasks, function(task) {
            task.preds = new Set(task.blocks);
            task.end = 0;
            task.scheduled = false;
        });

        // Parent priority influences the effective priority of children
        wbsVisit(tasks, function(tasks, key) {
            var task = tasks[key];
            if (task.parent == noParent) {
                task.effectivePriority = "";
            }
            else {
                var parent = tasks[task.parent];
                task.effectivePriority = parent.effectivePriority;
            }
            task.effectivePriority += task.priority;
        });
    };

    // Remove artifacts from preSchedule
    var postSchedule = function(tasks) {
        angular.forEach(tasks, function(task) {
            if (!task.scheduled) {
                console.log("Task " + task.key + " not scheduled.");
            }
            delete task.preds;
            delete task.scheduled;
            delete task.effectivePriority;
        });
    };

    // Return an array of eligible tasks
    var findEligible = function(tasks) {
        // Filter the input task hash to those that have not been
        // scheduled and do not have any predecessors then return just
        // the values in that hash as an array.
        return Object.values(Object.filter(tasks, function(task) {
            return !task.scheduled && task.preds.size == 0; 
        }));
    };

    // Sort based on business rules.  Bug before improvements, high
    // priority before low, etc.
    var compareTasks = function(t1, t2) {
        if (t1.type < t2.type) {
            return -1;
        }
        else if (t1.type > t2.type) {
            return 1;
        }
        else if (t1.effectivePriority < t2.effectivePriority) {
            return -1;
        }
        else if (t1.effectivePriority > t2.effectivePriority) {
            return 1;
        }
        // Larger duration first
        else if (t1.durationHours < t2.durationHours) {
            return 1;
        }
        else if (t1.durationHours > t2.durationHours) {
            return -1;
        }
        // Same type, priority and duration, compare ids
        // TODO - bigger first, more blocking first?
        else if (t1.id < t2.id) {
            return -1;
        }
        else if (t1.id > t2.id) {
            return 1;
        }
        else {
            return 0;
        }
    };

    // For each resource, the next available time to work.
    var nextByResource = {};

    // FUTURE - a sophisticated implementation could check a calendar
    // to see if the resource was unavailable due to PTO or something.
    var availableHours = function(date, resource) {
        // Skip weekends
        if (date.getDay() == 6 || date.getDay() == 0) {
            return 0;
        }
        // If we got passed a time that's after the end of the day,
        // there are no more hours available.
        if (date.getHours() > vm.availableHours) {
            return 0;
        }
        return vm.availableHours - date.getHours();
    };

    // FUTURE - this doesn't consider due dates
    var scheduleOneTask = function(task, tasks) {
        // Get the next time available for this resource.
        // If the resource hasn't been used yet, start now.
        if (nextByResource[task.resource]) {
            task.start = nextByResource[task.resource];
        }
        else {
            var start = new Date(Date.now());
            start.setHours(0);
            start.setMinutes(0);
            start.setSeconds(0);
            // now() is local time since epoch in UTC.  Make it UTC.
            start = new Date(start.getTime()
                             - (start.getTimezoneOffset() * 60000));
            task.start = start.getTime();
        }

        // This task can't start earlier than any of its predecessor's
        // ends.
        angular.forEach(task.blocks, function(id) {
            if (tasks[id].end > task.start) {
                task.start = tasks[id].end;
            }
        });

        // Move ahead from start until available hours by day
        // is enough to accomplish duration hours.
        var d = new Date(task.start);
        var remainingHours = task.durationHours;
        while (remainingHours > 0) {
            var available = availableHours(d, task.resource);
            if (available >= remainingHours) {
                d.setHours(d.getHours() + remainingHours);
                remainingHours = 0;
            }
            else {
                remainingHours -= available;
                d.setDate(d.getDate()+1);
                d.setHours(0);
            }
        }
        task.end = d.getTime();

        // Propagate end up to parent(s);
        for (var parentId = task.parent;
             parentId != noParent;
             parentId = tasks[parentId].parent) {
            if (tasks[parentId].end < task.end) {
                tasks[parentId].end = task.end;
            }
        }

        nextByResource[task.resource] = task.end;
        
        task.scheduled = true;

        // Update each successor to say this task no longer blocks
        angular.forEach(task.blocking, function(id) {
            tasks[id].preds.delete(task.id);
        });
    };

    // Tasks is a hash
    var scheduleTasks = function(tasks) {
        nextByResource = {};
        preSchedule(tasks);

        for (var eligible = findEligible(tasks);
             eligible.length != 0;
             eligible = findEligible(tasks)) {
            // Sort the eligible tasks by priority then schedule the first
            scheduleOneTask(eligible.sort(compareTasks)[0], tasks)
        }
        
        postSchedule(tasks);
    };

    // Add a single task to the chart.  Should be passed tasks in WBS
    // order.
    var addTaskToChart = function(chart, task) {

        var completionPercent;
        // Handle tasks with no work and nothing remaining (e.g.,
        // cancelled tasks).
        if (task.workedHours == 0 && task.remainingHours == 0) {
            completionPercent = 100;
        }
        else {
            completionPercent = 100 * task.workedHours
                / (task.workedHours + task.remainingHours);
        }

        var startString = new Date(task.start).toISOString().substring(0,10);
        var endString = new Date(task.end).toISOString().substring(0,10);

        var hasChildren = task.children.size > 0;

        var ganttTask = new JSGantt.TaskItem(chart,
                                             task.id,
                                             task.name,
                                             hasChildren ? '' : startString,
                                             hasChildren ? '' : endString,
                                             task.display,
                                             task.link,
                                             task.milestone,
                                             task.resource,
                                             completionPercent.toFixed(2),
                                             hasChildren, // Group
                                             task.parent,
                                             hasChildren, // Open
                                             Array.from(task.blocks).join());
        chart.AddTaskItem(ganttTask);
    };

    var addSampleTasks = function(g) {
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
    };

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
            .then(function successCallback(tickets) {
                // var here causes scoping problems, at least inside Angular.
                g = new JSGantt.GanttChart('g',document.getElementById('GanttChartDIV'), 'day',1);
                g.setShowRes(1); // Show/Hide Responsible (0/1)
                g.setShowDur(0); // Show/Hide Duration (0/1)
                g.setShowComp(0); // Show/Hide % Complete(0/1)
                g.setShowStartDate(0);
                g.setShowEndDate(0);
                g.setCaptionType('Complete');
                g.setLinkStyle('simple');
                
                // The Gantt has some unfortunate defaults.  For some
                // reason, passing an empty string here allows the
                // defaults to remain in effect.  Turning on
                // scrollbars is cheap and harmless and lets the
                // window open with browser/user defaults.
                g.setPopupFeatures('scrollbars=1');

                var tasks = hashFromArray(tickets.map(taskFromTicket), "id");

                // Epic link is issue key.  We need ID
                resolveEpics(tasks);

                // Remove references to tasks not in the chart.
                pruneLinks(tasks);

                scheduleTasks(tasks);

                if (true) {
                    g.setDateInputFormat("yyyy-mm-dd"); // ISO
                    
                    wbsVisit(tasks, function(tasks, key) {
                        addTaskToChart(g, tasks[key]);
                    });
                }
                else {
                    addSampleTasks(g);
                }
                    
                g.Draw();        
                g.DrawDependencies();
                
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
        // If the ticket is done, there is no remaining work.
        if (ticket.fields.status.statusCategory.name == 'Done') {
            return 0;
        }
        else if (!ticket.fields.timeestimate) {
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
    // passed back is a list of tickets which match the search criteria
    var getTickets = function(){
        var deferred = $q.defer();

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
            .then(function successCallback(response) {
                if (response.data.total > response.data.maxResults) {
                    alert("Not all tickets processed." +
                          " Got " + response.data.maxResults +
                          " out of " + response.data.total);
                }

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
