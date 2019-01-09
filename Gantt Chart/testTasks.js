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
    document.title = "Test Tasks";

    vm = this;
    
    vm.defaultEstimateHours = 8;

    var typeMap = {
        "Bug" : 0,
        "Task" : 1
    };

    var priorityMap = {
        "Blocker" : 0,
        "Critical" : 1,
        "Major" : 2,
        "Normal" : 3,
        "Minor" : 4,
        "Trivial" : 5
    };

    
    var taskColor = function(issue) {
        return "Skyblue";
    };


    // Sort based on business rules.  Bug before improvements, high
    // priority before low, etc.
    // FUTURE - can this be data driven?  Put in task lib?
    var prioritizeTasks = function(t1, t2) {
        t1duration = t1.workedHours + t1.remainingHours;
        t2duration = t2.workedHours + t2.remainingHours;
        
        if (t1.type.value < t2.type.value) {
            return -1;
        }
        else if (t1.type.value > t2.type.value) {
            return 1;
        }
        else if (t1.effectivePriority < t2.effectivePriority) {
            return -1;
        }
        else if (t1.effectivePriority > t2.effectivePriority) {
            return 1;
        }
        // Larger duration first
        else if (t1duration < t2.duration) {
            return 1;
        }
        else if (t1duration > t2duration) {
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


    // ========================================================================

    // Add a single task to the chart.  Should be passed tasks in WBS
    // order.
    var addTaskToChart = function(chart, task) {

        var completionPercent = 100 * task.workedHours
            / (task.workedHours + task.remainingHours);

        var startString = new Date(task.start).toISOString().substring(0,10);
        var finishString = new Date(task.finish).toISOString().substring(0,10);

        var hasChildren = task.children.size > 0;

        var ganttTask = new JSGantt.TaskItem(chart,
                                             task.id,
                                             task.name,
                                             hasChildren ? '' : startString,
                                             hasChildren ? '' : finishString,
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

    var tasks = {
        1 : {
            "id" : 1,
            "name" : "Task 1 - this should come first by resource leveling",
            "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
            "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
            "display" : "SkyBlue",
            "resource" : "Resource 1",
            "blocks" : [],
            "blocking" : [],
            "parent" : taskLib.noParent,
            "children" : [],
            "workedHours" : 10,
            "remainingHours" : 20
        },
        2 : {
            "id" : 2,
            "name" : "Task 2 - this should come second by resource leveling",
            "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
            "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
            "display" : "SkyBlue",
            "resource" : "Resource 1",
            "blocks" : [],
            "blocking" : [],
            "parent" : taskLib.noParent,
            "children" : [],
            "workedHours" : 10,
            "remainingHours" : 20
        },
        3 : {
            "id" : 3,
            "name" : "Task 3 (Test 1 - Resource leveling)",
            "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
            "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
            "display" : "SkyBlue",
            "resource" : "Resource 1",
            "blocks" : [],
            "blocking" : [],
            "parent" : taskLib.noParent,
            "children" : [4, 5],
            "workedHours" : 10,
            "remainingHours" : 20
        },
        4 : {
            "id" : 4,
            "name" : "Task 4 - this should come first by resource leveling",
            "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
            "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
            "display" : "SkyBlue",
            "resource" : "Resource 2",
            "blocks" : [],
            "blocking" : [],
            "parent" : 3,
            "children" : [],
            "workedHours" : 10,
            "remainingHours" : 20
        },
        5 : {
            "id" : 5,
            "name" : "Task 5 - this should come second by resource leveling",
            "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
            "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
            "display" : "SkyBlue",
            "resource" : "Resource 2",
            "blocks" : [],
            "blocking" : [],
            "parent" : 3,
            "children" : [],
            "workedHours" : 10,
            "remainingHours" : 20
        },
        6 : {
            "id" : 6,
            "name" : "Task 6 (Test 2 - Dependency)",
            "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
            "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
            "display" : "SkyBlue",
            "resource" : "Resource 1",
            "blocks" : [],
            "blocking" : [],
            "parent" : taskLib.noParent,
            "children" : [ 7, 8 ],
            "workedHours" : 10,
            "remainingHours" : 20
        },
        7 : {
            "id" : 7,
            "name" : "Task 7 - this should come second by dependency",
            "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
            "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
            "display" : "SkyBlue",
            "resource" : "Resource 3",
            "blocks" : [ 8 ],
            "blocking" : [],
            "parent" : 6,
            "children" : [],
            "workedHours" : 10,
            "remainingHours" : 20
        },
        8 : {
            "id" : 8,
            "name" : "Task 8 - this should come first by dependency",
            "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
            "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
            "display" : "SkyBlue",
            "resource" : "Resource 4",
            "blocks" : [],
            "blocking" : [ 7 ],
            "parent" : 3,
            "children" : [],
            "workedHours" : 10,
            "remainingHours" : 20
        }
    };


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

    taskLib.scheduleTasks(tasks, prioritizeTasks, { "hoursPerDay" : 5 });

    g.setDateInputFormat("yyyy-mm-dd"); // ISO

    var sortByStart = function(t1, t2) {
        if (t1.start < t2.start) {
            return -1;
        }
        else if (t1.start > t2.start) {
            return 1;
        }
        else {
            return 0;
        }
    };
    
    taskLib.wbsVisit(tasks, function(tasks, key) {
        addTaskToChart(g, tasks[key]);
    }, sortByStart);
    
    g.Draw();        
    g.DrawDependencies();
    
});
