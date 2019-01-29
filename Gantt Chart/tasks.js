// FIXME - this depends on angular.

// A task has:
// * id - a unique integer identifier
// * name - a user-friendly string describing the task
// * milestone - boolean indicating if the task is a milestone (zero-duration task)
// * properties which may affect scheduling.  Each in the form { "display" : "xxx", "value" : 1 }?
//   * type - "bug", "issue"
//   * priority - "high", "low"
// * resource - a string (who or what executes the task)
// * related tasks
//   * after - set of ids of preceding tasks (empty if none)
//   * before - set of ids of succeding tasks (empty if none)
//   * parent - id of parent task (noParent, if none)
//   * children - set of ids of child tasks (empty if none)
// * timing (effort, all floating point number of hours)
//   * remainingHours - hours the task should take to complete
//   * workedHours - hours worked on the task so far
// * Computed
//   * start - numeric value for start date (from Data.getTime())
//   * finish - numeric value for finish date
//
// Applications may put values in the hash "data" for their own purposes
//
// The tasks parameter to many of these functions is a hash in the form:
//
//     { id1 : task1, id2 : task2, ...}
//
// where each task has the form above.

// Create Object.filter() if it doesn't exist
if (typeof Object.filter !== "function") {
    Object.filter = (obj, predicate) => 
        Object.keys(obj)
        .filter( key => predicate(obj[key]) )
        .reduce( (res, key) => (res[key] = obj[key], res), {} );
}

// Adapted from https://javascriptweblog.wordpress.com/2010/12/07/namespacing-in-javascript/
var taskLib = (function() {
    // Remove links to tasks that aren't in the list
    var pruneLinks = function(tasks) {
        var linkTypes = ["before", "after", "children"];
        angular.forEach(tasks, function(task) {
            // If parent is set but isn't in the list, remove it from
            // the task.
            if (task.parent != taskLib.noParent && !tasks[task.parent]) {
                task.parent = taskLib.noParent;
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

    var fillConstraints = function(constraints) {
        if (!("hoursPerDay" in constraints)) {
            constraints["hoursPerDay"] = 8;
        }

        if (!("type" in constraints)) {
            constraints["type"] = "asap";
        }

        var now = new Date(Date.now());
        // now() is local time since epoch in UTC.  Make it UTC.
        now = new Date(now.getTime()
                       - (now.getTimezoneOffset() * 60000));

        // ASAP schedule start now by default
        if (constraints["type"] == "asap") {
            if (!("start" in constraints)) {
                constraints["start"] = now;
            }
            constraints["start"].setHours(0);
            constraints["start"].setMinutes(0);
            constraints["start"].setSeconds(0);
        }
        // ALAP schedules finish now by default
        else {
            if (!("finish" in constraints)) {
                constraints["finish"] = now;
            }
            constraints["finish"].setHours(constraints["hoursPerDay"]);
            constraints["finish"].setMinutes(0);
            constraints["finish"].setSeconds(0);
        }
    };

    // Recursively build an array of ids of descendants of tasks[id]
    //
    // On return, all descendants of tasks[id] have task.desc set
    var buildDesc = function(tasks, id) {
        var task = tasks[id];
        // A task is in its own "family" tree
        task.desc = [ id ];
        angular.forEach(task.children, function(cid) {
            task.desc = task.desc.concat(buildDesc(tasks, cid));
        });
        return task.desc;
    };

    // buildDesc() must be called on all tasks before this.
    var propagateDependencies = function(tasks, id) {
        var parent = tasks[id];
        var i;
        var depFields = [ "preds", "succs" ];
        for (i = 0; i < depFields.length; ++i) {
            // Forward and reverse dependencies are opposite
            var fwd = depFields[i];
            var rev = fwd == depFields[0] ? depFields[1] : depFields[0];
            angular.forEach(parent.children, function(cid) {
                var child = tasks[cid];
                // Cousins are descendants who are also dependents
                var cousins = new Set(child.desc.filter(x => child[fwd].has(x)));
                if (cousins.size == 0) {
                    angular.forEach(parent[fwd], function(id) {
                        if (!child[fwd].has(id)) {
                            child[fwd].add(id);
                            tasks[id][rev].add(cid);
                        }
                    });
                }
                propagateDependencies(tasks, cid);
            });
        }
    };

    // Decorate tasks to make schedling easier
    var preSchedule = function(tasks, constraints) {
        var c = constraints;
        if (c["type"] == "asap") {
            c.from = "start";
            c.to = "finish";
            c.dir = 1;
            c.sod = 0;                           // Start of day
            c.eod = constraints["hoursPerDay"];  // End of day
        }
        else {
            c.from = "finish";
            c.to = "start";
            c.dir = -1;
            c.sod = constraints["hoursPerDay"];
            c.eod = 0;
        }

        angular.forEach(tasks, function(task) {
            // Based on https://stackoverflow.com/questions/11526504
            // Divide by 10 to be ~27k years, not 271k.
            task[c.to] = c.dir * -864000000000000;
            task.scheduled = false;

            // preds are the tasks which precede this one when
            // scheduling. ALAP schedule goes finish to start to they
            // are reversed.
            if (constraints["type"] == "asap") {
                task.preds = new Set(task["after"]);
                task.succs = new Set(task["before"]);
            }
            else {
                task.preds = new Set(task["before"]);
                task.succs = new Set(task["after"]);
            }
        });

        var roots = Object.filter(tasks,
                                  task => task.parent == taskLib.noParent);
        angular.forEach(roots, function(root) {
            buildDesc(tasks, root.id);
        });

        angular.forEach(roots, function(root) {
            propagateDependencies(tasks, root.id);
        });

        // Parent priority influences the effective priority of children
        taskLib.wbsVisit(tasks, function(tasks, key) {
            var task = tasks[key];
            if (task.parent == taskLib.noParent) {
                task.effectivePriority = "";
            }
            else {
                var parent = tasks[task.parent];
                task.effectivePriority = parent.effectivePriority;
            }
            task.effectivePriority += task.priority.value;

            task.nBlocking = task.preds.size;
        });
    };

    // Remove artifacts from added by preSchedule()
    var postSchedule = function(tasks, constraints) {
        var c = constraints;
        constraints[c.to] = c.dir * -864000000000000;

        angular.forEach(tasks, function(task) {
            if (task.scheduled) {
                delete task.preds;
                delete task.succs;
                delete task.scheduled;
                delete task.effectivePriority;
                delete task.nBlocking;

                if (c.dir * task[c.to] > c.dir * constraints[c.to]) {
                    constraints[c.to] = task[c.to];
                }
            }
            else {
                console.log("Task " + task.id + " not scheduled.");
                console.log(task);
            }
        });

        if (constraints[c.from] instanceof Date) {
            constraints[c.to] = new Date(constraints[c.to]);
        }

        delete c.to
        delete c.from
        delete c.dir
    };

    // Return an array of eligible tasks
    var findEligible = function(tasks) {
        // Filter the input task hash to those that have not been
        // scheduled and do not have any predecessors then return just
        // the values in that hash as an array.
        return Object.values(Object.filter(tasks, function(task) {
            return !task.scheduled && task.nBlocking == 0; 
        }));
    };

    // For each resource, the next available time to work.
    var nextByResource = {};

    // FUTURE - a sophisticated implementation could check a calendar
    // to see if the resource was unavailable due to PTO or something.
    var availableHours = function(date, resource, constraints) {
        var c = constraints;
        var hoursPerDay = constraints["hoursPerDay"];
        var available;

        // Skip weekends
        if (date.getDay() == 6 || date.getDay() == 0) {
            available = 0;
        }
        else {
            // Outside working hours, no time available
            if (date.getHours() > hoursPerDay) {
                available = 0;
            }
            else {
                available = c.dir * (c.eod - date.getHours());
            }
        }
        return available;
    };

    // FUTURE - this doesn't consider due dates
    var scheduleOneTask = function(task, tasks, constraints) {
        //console.log("Scheduling " + task.id);
        var c = constraints;

        // Get the next time available for this resource.
        if (nextByResource[task.resource]) {
            task[c.from] = nextByResource[task.resource];
        }
        // If the resource hasn't been used yet and there is a start date
        // use that.
        else if (c.from in constraints) {
            if (constraints[c.from] instanceof Date) {
                task[c.from] = constraints[c.from].getTime();
            }
            else {
                task[c.from] = constraints[c.from];
            }
        }
        else {
            console.log("No " + c.from + " date specified.");
            return;
        }

        // ASAP: This task can't start earlier than any of its
        // predecessor's finishes.
        // ALAP: This task can't finish later than any of its
        // successors's starts.
        angular.forEach(task["preds"], function(id) {
            if (c.dir * tasks[id][c.to] > c.dir * task[c.from]) {
                task[c.from] = tasks[id][c.to];
            }
        });

        var d = new Date(task[c.from]);

        // Adjust end of day to start of next (ASAP) or start of day
        // to end of previous (ALAP)
        if (d.getHours() == c.eod) {
            d.setDate(d.getDate() + (c.dir * 1));
            d.setHours(c.sod);
        }

        task[c.from] = d.getTime();

        // Loop until available hours by day is enough to
        // accomplish remaining hours.
        var remainingHours = task.remainingHours;
        while (remainingHours > 0) {
            var available = availableHours(d, task.resource, constraints);
            if (available >= remainingHours) {
                d.setHours(d.getHours() + (c.dir * remainingHours));
                remainingHours = 0;
            }
            else {
                remainingHours -= available;
                d.setDate(d.getDate() + (c.dir * 1));
                d.setHours(c.dir == 1 ? 0 : constraints["hoursPerDay"]);
            }
        }
        task[c.to] = d.getTime();

        // Propagate end up to ancestors;
        for (var parentId = task.parent;
             parentId != taskLib.noParent;
             parentId = tasks[parentId].parent) {
            if (typeof tasks[parentId][c.from] === "undefined"
                || c.dir * tasks[parentId][c.from] > c.dir * task[c.from]) {
                tasks[parentId][c.from] = task[c.from];
            }
            if (typeof tasks[parentId][c.to] === "undefined"
                || c.dir * tasks[parentId][c.to] < c.dir * task[c.to]) {
                tasks[parentId][c.to] = task[c.to];
            }
        }

        nextByResource[task.resource] = task[c.to];
    };

    var compareOneField = function(t1, t2, field) {
        if (t1[field] < t2[field]) {
            return -1;
        }
        else if (t1[field] > t2[field]) {
            return 1;
        }
        else {
            return 0;
        }
    };

    return {
        // An unused ID
        noParent : 0,

        // Visit task in WBS order (a depth-first search).
        //
        // At each level, tasks are sorted if a compare function is provided.
        //
        // tasks - a hash of tasks indexed by id.
        //
        // visitor - a function to be applied to each id in WBS order.
        //   It is passed the hash and the key (id) to operate on.
        //
        // compareTasks - (OPTIONAL) a function to compare order tasks
        //   at each level
        wbsVisit : function(tasks, visitor, compareTasks) {
            var compareIds = function(id1, id2) {
                if (typeof compareTasks === "function") {
                    return compareTasks(tasks[id1], tasks[id2]);
                }
                else {
                    return 0;
                }
            };

            var roots = Object.filter(tasks, task => task.parent == taskLib.noParent);
            var queue = Object.keys(roots);
            while (queue.length != 0) {
                // Remove the task id at the head of the queue
                id = queue.shift();
                // Add this task's children to the front of the queue
                queue = Array.from(tasks[id].children)
                    .sort(compareIds)
                    .concat(queue);
                // Execute the visitor function on the current task
                visitor(tasks, id);
            }
        },
        
        compareStart : function(t1, t2) {
            return compareOneField(t1, t2, "start");
        },

        // Helper to turn strings into numbers for comparing when scheduling.
        //
        // map is a hash like:
        //     var typeMap = {
        //         "Bug" : 0,
        //         "Task" : 1
        //     };
        //
        // index is one of the strings.
        //
        // Returns a hash like { "display" : index, "value" : 1 }
        buildSchedulingField : function(map, index) {
            return {
                "display" : index,
                "value" : index in map ? map[index] : Object.keys(map).length
            };
        },

        // tasks is a hash
        // compareTasks is a function which compares two tasks and returns -1, 0, 1 in the usual way
        // constraints is a hash of constraints:
        //  * hoursPerDay
        //  * start - The start of the first task
        //  * finish - The finish of the last task
        //  * type - asap or alap
        //  * cp - if present compute critical path, if array return
        //    critical path
        scheduleTasks : function(tasks, compareTasks, constraints = {}) {
            nextByResource = {};

            fillConstraints(constraints);

            // Remove references to tasks not in the chart.
            pruneLinks(tasks);

            preSchedule(tasks, constraints);

            for (var eligible = findEligible(tasks);
                 eligible.length != 0;
                 eligible = findEligible(tasks)) {
                // Sort the eligible tasks by priority then schedule the next
                var next;
                if (constraints["type"] == "asap") {
                    next = 0;
                }
                else {
                    next = eligible.length - 1;
                }
                var toSchedule = eligible.sort(compareTasks)[next];

                if (toSchedule.scheduled) {
                    alert("Loop detected including task " + task.id + ".");
                    return;
                }

                // Only schedule leafs (tasks with no children)
                if (toSchedule.children.size == 0) {
                    scheduleOneTask(toSchedule,
                                    tasks,
                                    constraints);
                }

                toSchedule.scheduled = true;

                // Update each successor to say this task no longer blocks
                angular.forEach(toSchedule["succs"], function(id) {
                    tasks[id].nBlocking--;
                });
            }
            
            postSchedule(tasks, constraints);

            if ("cp" in constraints) {
                var start = {};
                var finish = {};
                angular.forEach(tasks, function(task) {
                    start[task.id] = task.start;
                    delete task["start"];
                    finish[task.id] = task.finish;
                    delete task["finish"];
                });

                var cons = Object.assign({}, constraints);
                delete cons["cp"];
                if (constraints["type"] == "asap") {
                    cons.type = "alap";
                    cons.finish = constraints["finish"];
                    delete cons["start"];
                }
                else {
                    cons.type = "asap";
                    cons.start = constraints["start"];
                    delete cons["finish"];
                }

                taskLib.scheduleTasks(tasks, compareTasks, cons);

                angular.forEach(tasks, function(task) {
                    if (start[task.id] == task.start) {
                        if (constraints["cp"] instanceof Array) {
                            constraints["cp"].push(task.id);
                        }
                        task["cp"] = true;
                        for (var parentId = task.parent;
                             parentId != taskLib.noParent;
                             parentId = tasks[parentId].parent) {
                            tasks[parentId]["cp"] = true;
                        }
                    }
                    task.start = start[task.id];
                    task.finish = finish[task.id];
                });
            }
        }
    };
})();
