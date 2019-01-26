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
//   * blocks - set of ids of preceding tasks (empty if none)
//   * blocking - set of ids of succeding tasks (empty if none)
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
        var linkTypes = ["blocking", "blocks", "children"];
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
    var preSchedule = function(tasks) {
        angular.forEach(tasks, function(task) {
            task.finish = 0;
            task.scheduled = false;
            task.preds = new Set(task.blocks);
            task.succs = new Set(task.blocking);
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
    var postSchedule = function(tasks) {
        angular.forEach(tasks, function(task) {
            if (task.scheduled) {
                delete task.preds;
                delete task.succs;
                delete task.scheduled;
                delete task.effectivePriority;
                delete task.nBlocking;
            }
            else {
                console.log("Task " + task.id + " not scheduled.");
                console.log(task);
            }
        });
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
    var availableHours = function(date, resource, hoursPerDay) {
        // Skip weekends
        if (date.getDay() == 6 || date.getDay() == 0) {
            return 0;
        }
        // If we got passed a time that's after the end of the day,
        // there are no more hours available.
        if (date.getHours() > hoursPerDay) {
            return 0;
        }
        return hoursPerDay - date.getHours();
    };

    // FUTURE - this doesn't consider due dates
    // FUTURE - this is ASAP.  Should generalize for ALAP/ASAP
    var scheduleOneTask = function(task, tasks, constraints) {
        // Get the next time available for this resource.
        if (nextByResource[task.resource]) {
            task.start = nextByResource[task.resource];
        }
        // If the resource hasn't been used yet and there is a start date
        // use that.
        else if ("start" in constraints) {
            task.start = constraints["start"];
        }
        // Otherwise, start at midnight today.
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
        // finishes.
        angular.forEach(task.preds, function(id) {
            if (tasks[id].finish > task.start) {
                task.start = tasks[id].finish;
            }
        });

        // Move ahead from start until available hours by day
        // is enough to accomplish remaining hours.
        var d = new Date(task.start);
        var remainingHours = task.remainingHours;
        while (remainingHours > 0) {
            var available = availableHours(d,
                                           task.resource,
                                           constraints.hoursPerDay);
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
        task.finish = d.getTime();

        // Propagate end up to ancestors;
        for (var parentId = task.parent;
             parentId != taskLib.noParent;
             parentId = tasks[parentId].parent) {
            if (typeof tasks[parentId].start === "undefined"
                || tasks[parentId].start > task.start) {
                tasks[parentId].start = task.start;
            }
            if (tasks[parentId].finish < task.finish) {
                tasks[parentId].finish = task.finish;
            }
        }

        nextByResource[task.resource] = task.finish;
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
        scheduleTasks : function(tasks, compareTasks, constraints = {}) {
            nextByResource = {};

            fillConstraints(constraints);

            // Remove references to tasks not in the chart.
            pruneLinks(tasks);

            preSchedule(tasks);

            for (var eligible = findEligible(tasks);
                 eligible.length != 0;
                 eligible = findEligible(tasks)) {
                // Sort the eligible tasks by priority then schedule the first
                var toSchedule = eligible.sort(compareTasks)[0];

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
                angular.forEach(toSchedule.succs, function(id) {
                    tasks[id].nBlocking--;
                });
            }
            
            postSchedule(tasks);
        }
    };
})();
