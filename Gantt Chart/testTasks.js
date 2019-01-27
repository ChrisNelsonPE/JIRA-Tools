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
                                             task.cp ? "Red" : "Skyblue",
                                             task.link,
                                             task.milestone,
                                             task.resource,
                                             completionPercent.toFixed(2),
                                             hasChildren, // Group
                                             task.parent,
                                             hasChildren, // Open
                                             Array.from(task["after"]).join());
        chart.AddTaskItem(ganttTask);
    };


    var addTestTasks = function(tasks, taskArray) {
        for (var i = 0; i < taskArray.length; ++i) {
            var task = taskArray[i];
            tasks[task.id] = task;
        }
    };

    var addTest1 = function(tasks) {
        addTestTasks(tasks, [
            {
                "id" : 10,
                "name" : "Test 1 - Resource leveling",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 10",
                "after" : [],
                "before": [],
                "parent" : taskLib.noParent,  "children" : [11, 12],
                "workedHours" : 10, "remainingHours" : 20
            },
            {
                "id" : 11,
                "name" : "Task 2 - 1st by resource leveling",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 11",
                "after" : [],
                "before" : [],
                "parent" : 10,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 12,
                "name" : "Task 3 - 2nd by resource leveling",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 11",
                "after" : [],
                "before" : [],
                "parent" : 10,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            }
        ]);
    };

    var addTest2 = function(tasks) {
        addTestTasks(tasks, [
            {
                "id" : 20,
                "name" : "Test 2 - Dependency",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 20",
                "after" : [],
                "before" : [],
                "parent" : taskLib.noParent,
                "children" : [ 21, 22 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 21,
                "name" : "Task 5 - 2nd by dependency",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 21",
                "after" : [ 22 ],
                "before" : [ ],
                "parent" : 20,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 22,
                "name" : "Task 6 - 1st by dependency",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 22",
                "after" : [ ],
                "before" : [ 21 ],
                "parent" : 20,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            }
        ]);
    };

    var addTest3 = function(tasks) {
        addTestTasks(tasks, [
            {
                "id" : 30,
                "name" : "Test 3 - Two blocking one",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 30",
                "after" : [],
                "before" : [],
                "parent" : taskLib.noParent,
                "children" : [ 31, 32, 33 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 31,
                "name" : "Task 31 - 1st by ID",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 31",
                "after" : [  ],
                "before" : [ 33 ],
                "parent" : 30,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 32,
                "name" : "Task 32 - 2nd, start with task 31",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 32",
                "after" : [  ],
                "before" : [ 33 ],
                "parent" : 30,
                "children" : [],
                "workedHours" : 5,
                "remainingHours" : 10
            },
            {
                "id" : 33,
                "name" : "Task 33 - 3rd by dependency",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 33",
                "after" : [ 31, 32 ],
                "before" : [ ],
                "parent" : 30,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            }
        ]);
    };

    var addTest4 = function(tasks) {
        addTestTasks(tasks, [
            {
                "id" : 40,
                "name" : "Test 4 - One blocking two",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 40",
                "after" : [],
                "before" : [],
                "parent" : taskLib.noParent,
                "children" : [ 41, 42, 43 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 41,
                "name" : "Task 41 - 1st by dependency",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 41",
                "after" : [  ],
                "before" : [ 42, 43 ],
                "parent" : 40,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 42,
                "name" : "Task 42 - 2nd by ID",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 42",
                "after" : [ 41 ],
                "before" : [ ],
                "parent" : 40,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 43,
                "name" : "Task 43 - 3rd by ID",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 43",
                "after" : [ 41  ],
                "before" : [ ],
                "parent" : 40,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
        ]);
    };

    var addTest5 = function(tasks) {
        addTestTasks(tasks, [
            {
                "id" : 50,
                "name" : "Test 5 - Effective priority",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 50",
                "after" : [],
                "before" : [],
                "parent" : taskLib.noParent,
                "children" : [ 51, 53 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 51,
                "name" : "Task 51 - Low-priority group",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Minor"),
                "resource" : "Resource 51",
                "after" : [  ],
                "before" : [ ],
                "parent" : 50,
                "children" : [ 52 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 52,
                "name" : "Task 52 - 2nd by effective priority",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 52",
                "after" : [  ],
                "before" : [ ],
                "parent" : 51,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 53,
                "name" : "Task 53 - High-priority group",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Blocker"),
                "resource" : "Resource 53",
                "after" : [ ],
                "before" : [ ],
                "parent" : 50,
                "children" : [ 54 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 54,
                "name" : "Task 54 - 1st by effective priority",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 52",
                "after" : [  ],
                "before" : [ ],
                "parent" : 53,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
        ]);
    };

    var addTest6 = function(tasks) {
        addTestTasks(tasks, [
            {
                "id" : 60,
                "name" : "Test 6 - Group blocks group",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 60",
                "after" : [],
                "before" : [],
                "parent" : taskLib.noParent,
                "children" : [ 61, 63 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 61,
                "name" : "Task 61 - 2nd group",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Minor"),
                "resource" : "Resource 61",
                "after" : [ 63 ],
                "before" : [ ],
                "parent" : 60,
                "children" : [ 62 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 62,
                "name" : "Task 62 - 2nd by group blocking",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 62",
                "after" : [  ],
                "before" : [ ],
                "parent" : 61,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 63,
                "name" : "Task 63 1st group",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Blocker"),
                "resource" : "Resource 63",
                "after" : [ ],
                "before" : [ 61 ],
                "parent" : 60,
                "children" : [ 64 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 64,
                "name" : "Task 64 - 1st by group blocking",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 64",
                "after" : [  ],
                "before" : [ ],
                "parent" : 63,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
        ]);
    };

    var addTest7 = function(tasks) {
        addTestTasks(tasks, [
            {
                "id" : 70,
                "name" : "Test 7 - Group blocks task",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 70",
                "after" : [],
                "before" : [],
                "parent" : taskLib.noParent,
                "children" : [ 71, 73 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 71,
                "name" : "Task 71 - 2nd group",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Minor"),
                "resource" : "Resource 71",
                "after" : [  ],
                "before" : [ ],
                "parent" : 70,
                "children" : [ 72 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 72,
                "name" : "Task 72 - 2nd by dependency",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 72",
                "after" : [ 73 ],
                "before" : [  ],
                "parent" : 71,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 73,
                "name" : "Task 73 1st group",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Blocker"),
                "resource" : "Resource 73",
                "after" : [  ],
                "before" : [ 72 ],
                "parent" : 70,
                "children" : [ 74 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 74,
                "name" : "Task 74 - 1st by dependency",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 74",
                "after" : [  ],
                "before" : [ ],
                "parent" : 73,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
        ]);
    };

    var addTest8 = function(tasks) {
        addTestTasks(tasks, [
            {
                "id" : 80,
                "name" : "Test 8 - Task blocks group",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 80",
                "after" : [],
                "before" : [],
                "parent" : taskLib.noParent,
                "children" : [ 81, 83 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 81,
                "name" : "Task 81 - 2nd group",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Minor"),
                "resource" : "Resource 81",
                "after" : [ 84 ],
                "before" : [ ],
                "parent" : 80,
                "children" : [ 82 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 82,
                "name" : "Task 82 - 2nd by dependency",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 82",
                "after" : [ ],
                "before" : [  ],
                "parent" : 81,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 83,
                "name" : "Task 83 1st group",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Blocker"),
                "resource" : "Resource 83",
                "after" : [  ],
                "before" : [ ],
                "parent" : 80,
                "children" : [ 84 ],
                "workedHours" : 10,
                "remainingHours" : 20
            },
            {
                "id" : 84,
                "name" : "Task 84 - 1st by dependency",
                "type" : taskLib.buildSchedulingField(typeMap, "Bug"),
                "priority" : taskLib.buildSchedulingField(priorityMap, "Major"),
                "resource" : "Resource 84",
                "after" : [ ],
                "before" : [ 81 ],
                "parent" : 83,
                "children" : [],
                "workedHours" : 10,
                "remainingHours" : 20
            },
        ]);
    };


    var tasks = {};

    addTest1(tasks);
    addTest2(tasks);
    addTest3(tasks);
    addTest4(tasks);
    addTest5(tasks);
    addTest6(tasks);
    addTest7(tasks);
    addTest8(tasks);

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

    var constraints = {
        "start" : new Date(2019,0,7),
        "type" : "asap",
//        "finish" : new Date(2019,0,25),
//        "type" : "alap",
        "hoursPerDay" : 5,
    };

    taskLib.scheduleTasks(tasks, prioritizeTasks, constraints);

    g.setDateInputFormat("yyyy-mm-dd"); // ISO
    
    taskLib.wbsVisit(tasks, function(tasks, key) {
        addTaskToChart(g, tasks[key]);
    }, taskLib.compareStart);
    
    g.Draw();        
    g.DrawDependencies();
});
