
/**
 * @typedef { { parallel: boolean, action: string, args: [string] } } PddlStep
 */

/**
 * @typedef { [ PddlStep ] } PddlPlan
 */

export default class PddlExecutor {

    /**
     * 
     * @param { ...{pddlAction} } } actions 
     */
    constructor(...actions) {
        for (let actionClass of actions) {
            this.addAction(actionClass)
        }
    }

    actions = {}
    stop_executing = false

    addAction(intentionClass) {
        this.actions[intentionClass.name.toLowerCase()] = intentionClass
    }

    getAction(name) {
        return this.actions[name]
    }

    /**
     * @param {PddlPlan} plan 
     */
    async exec(plan) {

        var previousStepGoals = []
        for (const step of plan) {

            if (this.stop_executing) {
                break
            }

            if (step.parallel && !this.stop_executing) {
                //console.log('Starting concurrent step', step.action, ...step.args)
            }
            else if (!step.parallel && !this.stop_executing) {
                await Promise.all(previousStepGoals)
                previousStepGoals = []
                //console.log('Starting sequential step ', step.action, ...step.args)
            }

            let actionClass = this.getAction(step.action)
            if (!actionClass && !this.stop_executing)
                throw new Error("pddlAction class not found for " + step.action)

            if (!this.stop_executing) {
                previousStepGoals.push(
                    actionClass.exec(...step.args).catch(err => {
                        throw step//new Error('Step failed');
                    })
                )
            }

        }

        // wait for last steps to complete before finish blackbox plan execution intention
        if (this.stop_executing) {
            this.stop_executing = false
            return false
        }

        await Promise.all(previousStepGoals)
        return true

    }

}

// var kitchenAgent = new Agent('kitchen')
// kitchenAgent.intentions.push(DimOnLight)
// kitchenAgent.intentions.push(Blackbox)

// var blackbox = new Blackbox(kitchenAgent, new LightOn({l: 'light1'}), './tmp/domain-lights.pddl', './tmp/problem-lights.pddl')
// blackbox.run()

