In DES Studio, which uses Pidd's Three-Phase Method, you handle branching outcomes based on whether the branch is
  probabilistic (e.g., 80% pass, 20% fail) or conditional (e.g., if queue length > 5 then route to B, else route to
  A).

  Here is how you model both scenarios:

  1. Probabilistic Branching (Using B-Event Schedules)
  If an activity ends and the entity must randomly route to one of two outcomes (e.g., a quality check where 10% fail
  and need rework), you handle this using Custom Distributions in the follow-on schedule of a C-Event.

  How to set it up:
   1. Create your follow-on B-Events: Create one B-event for the "Pass" outcome (e.g., Add to Pack Queue) and one for
      the "Fail" outcome (e.g., Add to Rework Queue).
   2. Use a Custom Distribution: In the C-event that represents the quality check service, you schedule both
      follow-on B-events, but you use a Custom distribution that returns 0 (meaning do not schedule) or 1 (meaning
      schedule now) based on a random draw.

  Currently, DES Studio's built-in distributions handle time. To route probabilistically, you often schedule an
  intermediate B-Event (e.g., InspectComplete) which then uses macros to modify the entity's state variables, and
  subsequent C-events look at that state variable to determine the next step.

  (Note: If the UI doesn't explicitly support a boolean/routing distribution yet, the standard workaround in DES is
  assigning a random attribute to the entity and using conditions).

  2. Conditional Branching (Using C-Event Conditions)
  If the branch depends on the state of the system (e.g., "if the Fast queue is full, route to the Slow queue"), you
  handle this in Phase C.

  How to set it up:
  Instead of having the arrival B-Event directly place the entity in a specific queue, you have the arrival B-Event
  place the entity in a "Holding" queue or simply update a state variable.

  Then, you create two competing C-Events:
   * C-Event 1 (Route Fast): Condition: queue(Holding).length > 0 AND queue(Fast).length < 5. Effect: ASSIGN(Holding,
     Server) or move them to the Fast queue.
   * C-Event 2 (Route Slow): Condition: queue(Holding).length > 0 AND queue(Fast).length >= 5. Effect: move them to
     the Slow queue.

  The Most Common Pattern: Attribute-Based Routing
  The cleanest way to handle complex branching in DES Studio is:
   1. When an activity finishes (B-Event), assign a specific attribute to the entity (e.g., needsRework = true or
      needsRework = false).
   2. Create separate C-Events that watch for those attributes.
       * C-Event: Start Rework (Condition: entity in queue AND entity.needsRework == true)
       * C-Event: Start Pack (Condition: entity in queue AND entity.needsRework == false)

  Would you like me to create a small example model demonstrating one of these patterns so you can see the exact JSON
  structure?
