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
//   * start - numeric value for start date (from Date.getTime())
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

    // Start/finish date origin predecence constant values
    //
    // Lower numbers are better.  That is, a due date on a task
    // takes precedence over a date computed from dependencies.
    // TracPM handled actual and scheduled times before task
    // times.  This code does not.
    var SF_LIMIT = 0         // Set by resource leveling
    var SF_ACTUAL = 1        // ** Not used **
    var SF_SCHEDULE = 2      // ** Not used **
    var SF_TASK = 3          // From task
    var SF_DEPENDENCIES = 4  // From previous/next tasks
    var SF_PROJECT = 5       // From project start/finish
    var SF_DEFAULT = 6       // Defaulted to today

    // Based on https://stackoverflow.com/questions/11526504
    // Divide by 10 to be ~27k years, not 271k.
    var MAX_TIME = 864000000000000;
    
    var MS_PER_HOUR = 1000 * 60 * 60;
    
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
            // FIXME - not sure if SF_DEFAULT is right
            task['calc_' + c.to] = [ c.dir * -MAX_TIME, SF_DEFAULT ];
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
        constraints[c.to] = c.dir * -MAX_TIME;

        angular.forEach(tasks, function(task) {
            if (task.scheduled) {
                delete task.preds;
                delete task.succs;
                delete task.scheduled;
                delete task.effectivePriority;
                delete task.nBlocking;

                task[c.to] = task['calc_' + c.to][0];
                task[c.from] = task['calc_' + c.from][0];

                if (c.dir * task['calc_' + c.to][0]
                    > c.dir * constraints[c.to]) {
                    constraints[c.to] = task['calc_' + c.to][0];
                }
                
                delete task['calc_' + c.to];
                delete task['calc_' + c.from];
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

        // No time available on weekends
        if (date.getDay() == 6 || date.getDay() == 0) {
            available = 0;
        }
        else {
            available = hoursPerDay;
        }
        return available;
    };

    // Compute the number of milliseconds (positive or negative) to
    // add to fromDate to account for hours of work, allowing for
    // weekends, resource availablility, etc.
    //
    // c - constraints (hoursPerDay is used)
    // t - task (resource is used)
    // hours - number of hours (real or integer) to account for
    // fromDate - millisecond representation of date to work from
    var calendarOffset = function(c, t, hours, fromDate) {
        var sign = (hours < 0) ? -1 : 1;
        var delta = 0;

        while (hours != 0) {
            var f = new Date(fromDate + delta);

            // Get the total hours available for the resource on that date
            var available = availableHours(f, t.resource, c);

            // Convert 4:30 to 4.5, etc.
            var h = f.getHours()
                + (f.getMinutes() / 60.0)
                + (f.getSeconds() / 3600.0);

            if (sign == -1) {
                if (h < available) {
                    available = h;
                }
            }
            else {
                if (c.hoursPerDay - h < available) {
                    available = c.hoursPerDay - h;
                }
            }

            // If we can finish the task this day
            if (available >= Math.abs(hours)) {
                // See how many hours are available for other tasks this day
                available += -1 * sign * hours;

                // If there are no more hours this day, make sure that
                // the delta ends up at the end (start or finish) of
                // the day
                if (available == 0) {
                    if (sign == -1) {
                        delta -= h * MS_PER_HOUR;
                    }
                    else {
                        delta += (c.hoursPerDay - h) * MS_PER_HOUR;
                    }
                }
                // If there is time left after this, just update delta
                // within this day
                else {
                    delta += hours * MS_PER_HOUR;
                }

                // No hours left when we're done
                hours = 0;
            }
            // If we can't finish the task this day
            else {
                // We do available hours of work this day...
                hours -= sign * available;

                // ... And move to another day to do more.
                if (sign == -1) {
                    // Account for the time worked this date (that is,
                    // get to the start of the day)
                    delta -= h * MS_PER_HOUR;
                    // Back up to the end of the previous day
                    delta -= (24 - c.hoursPerDay) * MS_PER_HOUR;
                }
                else {
                    // Account for the time worked this day (that is,
                    // move to the end of today)
                    delta += (c.hoursPerDay - h) * MS_PER_HOUR;
                    // Move ahead to the start of the next day
                    delta += (24 - c.hoursPerDay) * MS_PER_HOUR;
                }
                // TODO - Could move both end/start of day calculations here as
                // delta += sign * (24 - c.hoursPerDay) * MS_PER_HOUR
            }
        }

        return delta;
    }

    // Adjust date to skip non-working hours.
    var wrapDate = function(c, date) {
        var d = new Date(date);
        if (c.dir == -1) {
            if (d.getHours() == 0 && d.getMinutes() == 0) {
                date -= (24 - c.hoursPerDay) * MS_PER_HOUR;
            }
        }
        else {
            if (d.getHours() == c.hoursPerDay && d.getMinutes() == 0) {
                date += (24 - c.hoursPerDay) * MS_PER_HOUR;
            }
        }
        return date;
    };

    var logDate = function(msg, date) {
        var d;
        if (date instanceof Date) {
            d = date;
        }
        else {
            d = new Date(date);
        }
        console.log(msg + ": " + d);
    };

    var scheduleOneTask = function(task, tasks, constraints) {
        //console.log("Scheduling " + task.id);
        var c = constraints;
        var from, to;

        if (c.from in task) {
            from = task[c.from] instanceof Date
                ? task[c.from].getTime()
                : task[c.from];
            logDate("Task " + task.id + " had " + c.from + " date", from);
            task['calc_' + c.from] = [ from, SF_TASK ];
        }
        else {
            // Find latest predecessor's finish (ASAP) or earliest
            // successor's start (ALAP)
            from = undefined;
            angular.forEach(task["preds"], function(id) {
                if (from == undefined
                    || c.dir * tasks[id]['calc_' + c.to][0] > from) {
                    from = tasks[id]['calc_' + c.to][0];
                }
            });
            // If dependencies give a date, use it.
            if (from != undefined) {
                from = wrapDate(c, from);
                logDate("Task " + task.id + " " + c.from + " from deps", from);
                task['calc_' + c.from] = [ from, SF_DEPENDENCIES ];
            }
            // Dependencies don't matter, use the project date
            else if (c.from in constraints) {
                if (constraints[c.from] instanceof Date) {
                    from = constraints[c.from].getTime();
                }
                else {
                    from = constraints[c.from];
                }
                logDate("Task " + task.id + " " + c.from + " from proj", from);
                task['calc_' + c.from] = [ from, SF_PROJECT ];
            }
            else {
                // FIXME - use today?
                console.log("No " + c.from + " date specified.");
                return;
            }

        }

        // If there is a resource, get the next time available for it
        if (task.resource != undefined && nextByResource[task.resource]) {
            from = task['calc_' + c.from][0];
            if (c.dir * from < c.dir * nextByResource[task.resource]) {
                task['calc_' + c.from] =
                    [ nextByResource[task.resource], SF_LIMIT ];
                logDate("Task " + task.id + " " + c.from
                        + " updated from resource " + task.resource,
                        nextByResource[task.resource]);
            }
        }

        // If the task has a to date, use it
        if (c.to in task) {
            to = task[c.to] instanceof Date ? task[c.to].getTime() : task[c.to];
            logDate("Task " + task.id + " had " + c.to + " date", to);
            task['calc_' + c.to] = [ to, SF_TASK ];
        }
        // Otherwise, the to date is based on the from date and the
        // work to be done
        else {
            to = task['calc_' + c.from][0]
                + calendarOffset(c,
                                 task,
                                 task.remainingHours,
                                 task['calc_' + c.from][0]);
            
            logDate("Task " + task.id + " " + c.to
                    + " set from " + c.from
                    + " plus " + task.remainingHours + " hours' work",
                    to);
            task['calc_' + c.to] = [ to, task['calc_' + c.from][1]];
        }

        // If from's precedence is better (lower) than to's,
        // update to based on from and remaining hours.
        if (task['calc_' + c.from][1] < task['calc_' + c.to][1]) {
            to = task['calc_' + c.from][0]
                + calendarOffset(c,
                                 task,
                                 task.remainingHours,
                                 task['calc_' + c.from][0]);
            logDate("Task " + task.id + " " + c.to
                    + " updated from " + c.from
                    + " plus " + task.remainingHours + " hours' work",
                    to);
            task['calc_' + c.to] = [ to, task['calc_' + c.from][1]];
        }
        // If from's precedence is worse (higher) than to's,
        // update from based on to and remaining hours.
        else if (task['calc_' + c.from][1] > task['calc_' + c.to][1]) {
            from = task['calc_' + c.to][0]
                + calendarOffset(c,
                                 task,
                                 -task.remainingHours,
                                 task['calc_' + c.to][0]);
            logDate("Task " + task.id + " " + c.from
                    + " updated from " + c.to
                    + " minus " + task.remainingHours + " hours' work",
                    from);
            task['calc_' + c.from] = [ from, task['calc_' + c.to][1]];
        }
            

        // Propagate end up to ancestors;
        for (var parentId = task.parent;
             parentId != taskLib.noParent;
             parentId = tasks[parentId].parent) {
            if (typeof tasks[parentId]['calc_' + c.from] === "undefined"
                || c.dir * tasks[parentId]['calc_' + c.from][0]
                > c.dir * task['calc_' + c.from][0]) {
                tasks[parentId]['calc_' + c.from] = task['calc_' + c.from];
            }
            if (typeof tasks[parentId]['calc_' + c.to] === "undefined"
                || c.dir * tasks[parentId]['calc_' + c.to][0]
                < c.dir * task['calc_' + c.to][0]) {
                tasks[parentId]['calc_' + c.to] = task['calc_' + c.to];
            }
        }

        nextByResource[task.resource] = wrapDate(c, task['calc_' + c.to][0]);
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
            var queue = Object.keys(roots).sort(compareIds);
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
        
        compareByFields : function(t1, t2, ...fieldNames) {
            var field = fieldNames.shift();
            if (t1[field] < t2[field]) {
                return -1;
            }
            else if (t1[field] > t2[field]) {
                return 1;
            }
            else if (fieldNames.length == 0) {
                return 0;
            }
            else {
                return this.compareByFields(t1, t2, fieldNames);
            }
        },

        compareStart : function(t1, t2) {
            return this.compareByFields(t1, t2, "start");
        },

        // Helper to turn strings into numbers for comparing when scheduling.
        //
        // list is an array like:
        //     var types = [ "Bug", "Task" ];
        //
        // item is one of the strings.
        //
        // Returns a hash like { "display" : item, "value" : 1 }
        // where value is the length of the list if item is not found
        buildSchedulingField : function(list, item) {
            var index = list.indexOf(item);
            return {
                "display" : item,
                "value" : index != -1 ? index : list.length
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
