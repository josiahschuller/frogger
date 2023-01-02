import { fromEvent, interval, merge, ObjectUnsubscribedError } from "rxjs";
import { filter, map, scan } from "rxjs/operators";
import "./style.css";

class RNG {
  /*
  This class is used to generate a random number (purely). This code is taken from the tutorial exercises.
  */
  m: number = 0x80000000; // 2**31
  a: number = 1103515245;
  c: number = 12345;
  state: number;
  constructor(seed: number) {
    this.state = seed;
  }
  nextInt() {
    // Returns a number in the range of [0, 2**31]
    return (this.a * this.state + this.c) % this.m;
  }
  nextFloat() {
    // Returns a number in the range of [0,1]
    return this.nextInt() / (this.m - 1);
  }
}

type Key = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';
type Frogger = Readonly<{
  x: number, // x coordinate
  y: number, // y coordinate
  radius: number // radius of circle
}>
type Object = Readonly<{
  id: string, // id used for HTML id
  collidable: boolean, // whether Frogger dies upon touching the object
  ridable: boolean, // whether Frogger moves with the object
  beingCarried: boolean, // whether the object moves with Frogger
  end: boolean, // whether the object is an end target
  x: number, // x coordinate
  y: number, // y coordinate
  width: number, // width of rectangle
  height: number, // height of rectangle
  color: string[], // colors of rectangle for each stage
  movement: number[] // movement of rectangle in x and y directions
}>
type State = Readonly<{
  rng: RNG | null, // random number generator class
  stage: number, // current stage
  elapsed: number, // number of ticks elapsed
  highScore: number, // highest score so far
  points: number, // current score
  lives: number, // number of lives left
  endsFilled: number, // number of end targets filled
  canvas: {
    width: number, // canvas width
    height: number // canvas height
  }
  frogger: Frogger, // Frogger
  objects: Object[] // list of objects
}>

function main() {
  /**
   * This function contains all the JavaScript to run the game!
   */


  const GENERATE_ROW = (canvasWidth: number) => (collidable: boolean) => (ridable: boolean) => (beingCarried: boolean) => (end: boolean) => (color: string[]) => (initX: number) => (objectHeight: number) => (objectWidth: number) => (objectCount: number) => (objectMovement: number[]) => (y: number) => (name: string) => {
    /*
    This function generates a row of objects.
    Inputs:
    - canvasWidth (number): the width of the canvas
    - collidable (boolean): whether each object will kill frogger or not
    - ridable (boolean): whether frogger can ride the object or not
    - end (boolean): whether each object is a target object for frogger to reach
    - color (string): the color of each object
    - initX (number): the x value of the first object
    - objectHeight (number): the height of each object
    - objectWidth (number): the width of each object
    - objectCount (number): the nunmber of objects in the row
    - objectMovement (number): the speed and direction of movement (positive indicates to the right, negative indicates to the left)
    - y (number): the y value of each object
    - name (string): a name used to identify the row (for HTML IDs)

    Output: A list of objects (Object[])
    */
    return [...Array(objectCount).keys()].map((i: number) => {
      return {
        id: name.concat(`${i}`),
        collidable: collidable,
        ridable: ridable,
        beingCarried: beingCarried,
        end: end,
        x: objectMovement[0] ?
          (initX + i*(canvasWidth + objectWidth)/objectCount) % (canvasWidth + objectWidth) :
          initX + i*(canvasWidth)/objectCount,
        y: y + 50/2 - objectHeight/2,
        width: objectWidth,
        height: objectHeight,
        color: color,
        movement: objectMovement
      }
    })
  }

  const GENERATE_CAR_ROW = GENERATE_ROW(600)(true)(false)(false)(false)(["red", "lightblue", "sienna", "black", "white"])(0)(30)(60), // Row of cars
  GENERATE_SAFE_ROW = GENERATE_ROW(600)(false)(false)(false)(false)(["mediumorchid"])(0)(50)(600)(1)([0, 0]), // Safe row (purple)
  GENERATE_LOG_ROW = GENERATE_ROW(600)(false)(true)(false)(false)(["orange"])(0)(30)(121)(3), // Row of logs
  GENERATE_WATER_ROW = GENERATE_ROW(600)(true)(false)(false)(false)(["blue", "darkblue", "darkred", "black", "white"])(120)(30)(121)(3), // Row of water
  GENERATE_LOG_WATER_ROW = (movement: number[]) => (y: number) => (name: string) =>       GENERATE_LOG_ROW(movement)(y)(name + "log").concat(GENERATE_WATER_ROW(movement)(y)(name + "water")), // Row of logs and water
  GENERATE_SUBMERGIBLE_LOG_WATER_ROW = (movement: number[]) => (y: number) => (name: string) => GENERATE_LOG_ROW(movement)(y)(name + "submergible").concat(GENERATE_WATER_ROW(movement)(y)(name + "water")); // Row of submergible logs and water

  const GENERATE_BIRD = (x: number) => (y: number) => (movement: number[]) => (id: string) => {
    /*
    This function generates a bird enemy
    Inputs:
    - x (number): the x coordinate of the bird
    - y (number): the y coordinate of the bird
    - movement (number): the movement of the bird
    - id (string): the id of the bird
    Output: An Object of a bird
    */
    return {
      id: "bird" + id,
      collidable: true,
      ridable: false,
      beingCarried: false,
      end: false,
      x: x,
      y: y,
      width: 50,
      height: 30,
      color: ["gold"],
      movement: movement
    }
  }

  const GENERATE_FLY = (id: string) => {
    /*
    This function generates a fly
    Inputs:
    - id (string): the id of the fly
    Output: An Object of a fly
    */
    return {
      id: "fly" + id,
      collidable: false,
      ridable: false,
      beingCarried: false,
      end: false,
      x: -1000,
      y: 10,
      width: 30,
      height: 30,
      color: ["saddlebrown"],
      movement: [0, 0]
    }
  }

  const GENERATE_FLOWER = (x: number) => (y: number) => (movement: number[]) => (id: string) => {
    /*
    This function generates a flower
    Inputs:
    - x (number): the x coordinate of the flower
    - y (number): the y coordinate of the flower
    - movement (number): the movement of the flower
    - id (string): the id of the flower
    Output: An Object of a flower
    */
    return {
      id: "flower" + id,
      collidable: false,
      ridable: false,
      beingCarried: false,
      end: false,
      x: x,
      y: y,
      width: 20,
      height: 20,
      color: ["magenta"],
      movement: movement
    }
  }

  function isBird(object: Object): boolean {
    /*
    This function returns whether a given object is a bird or not.
    Inputs:
    - object (Object): A given object to be checked
    Output: A Boolean of whether the object is a bird or not
    */
    return object.id.includes("bird");
  }
  function isFly(object: Object): boolean {
    /*
    This function returns whether a given object is a fly or not.
    Inputs:
    - object (Object): A given object to be checked
    Output: A Boolean of whether the object is a fly or not
    */
    return object.id.includes("fly");
  }
  function isFlower(object: Object): boolean {
    /*
    This function returns whether a given object is a flower or not.
    Inputs:
    - object (Object): A given object to be checked
    Output: A Boolean of whether the object is a flower or not
    */
    return object.id.includes("flower");
  }



  const INITIAL_STATE: State = {
    rng: null,
    stage: 0,
    elapsed: 0,
    highScore: 0,
    points: 0,
    lives: 3,
    endsFilled: 0,
    canvas: {
      width: 600,
      height: 600
    },
    frogger: {
      x: 275,
      y: 576,
      radius: 23
    },
    objects: [
      GENERATE_ROW(600)(false)(false)(false)(false)(["blue", "darkblue", "darkred", "black", "white"])(0)(300)(600)(1)([0, 0])(0)("waterBackground"),
      GENERATE_SAFE_ROW(550)("start"),
      GENERATE_CAR_ROW(2)([-0.5, 0])(500)("carRow0"),
      GENERATE_CAR_ROW(2)([1, 0])(450)("carRow1"),
      GENERATE_CAR_ROW(3)([-1.5, 0])(400)("carRow2"),
      GENERATE_CAR_ROW(3)([1.5, 0])(350)("carRow3"),
      GENERATE_SAFE_ROW(300)("middle"),
      GENERATE_LOG_WATER_ROW([-1, 0])(250)("logWater0"),
      GENERATE_LOG_WATER_ROW([1, 0])(200)("logWater1"),
      GENERATE_SUBMERGIBLE_LOG_WATER_ROW([-1.5, 0])(150)("logWater2"),
      GENERATE_LOG_WATER_ROW([1.5, 0])(100)("logWater3"),
      GENERATE_LOG_WATER_ROW([-2, 0])(50)("logWater4"),
      GENERATE_ROW(600)(false)(false)(false)(true)(["palegreen"])(0)(50)(60)(5)([0, 0])(0)("endTarget"),
      GENERATE_ROW(600)(true)(false)(false)(false)(["blue", "darkblue", "darkred", "black", "white"])(60)(50)(60)(5)([0, 0])(0)("waterEnd"),
      GENERATE_FLY("fly0"),
      GENERATE_FLOWER(9999)(0)([0, 0])("flower0"),
      GENERATE_BIRD(9999)(0)([0, 0])("bird0")
    ].flat()
  }
  

  // Move class (to represent a move and the number of points gained from the move)
  class Move { constructor(public readonly x: number, public readonly y: number, public readonly points: number) {}}
  // Tick class 
  class Tick {};

  // observeKey is an observable which observes any user input
  const OBSERVE_KEY_DOWN = <T>(k: Key, result: () => T) =>
    fromEvent<KeyboardEvent>(document, "keydown")
      .pipe(
        filter(({code})=>code === k),
        filter(({repeat})=>!repeat),
        map(result));


  // The first four observables below observe the pressing of the arrow keys.
  // THe last observable represents a tick.
  const
    moveLeft = OBSERVE_KEY_DOWN("ArrowLeft",()=>new Move(-50, 0, 0)),
    moveRight = OBSERVE_KEY_DOWN("ArrowRight",()=>new Move(50, 0, 0)),
    moveUp = OBSERVE_KEY_DOWN("ArrowUp",()=>new Move(0, -50, 5)),
    moveDown = OBSERVE_KEY_DOWN("ArrowDown",()=>new Move(0, 50, -5)),
    tick = interval(15).pipe(map(() => new Tick()));
  

  function objectColor(object: Object, state: State): string {
    return object.color[state.stage % object.color.length]
  }

  function updateView(state: State): void {
    /*
    This function is what is called in the subscription on all the observables.
    It is the only IMPURE function.
    It updates the program to a given state.
    Inputs:
    - State: state (the state to update to)
    */

    // Set canvas width and height
    const canvas = document.querySelector("#svgCanvas") as SVGElement & HTMLElement;
    canvas?.setAttribute("width", `${state.canvas.width}`);
    canvas?.setAttribute("height", `${state.canvas.height}`);

    const backgroundLayer = document.getElementById("backgroundLayer");
    const foregroundLayer = document.getElementById("foregroundLayer");

    // Loop through each object in the game (apart from frogger)
    state.objects.forEach((objectState) => {
      const object = document.getElementById(objectState.id);
      if (object) {
        // If the object exists, update its position
        object.setAttribute("width", `${objectState.width}`);
        object.setAttribute("height", `${objectState.height}`);
        object.setAttribute("x", `${objectState.x}`);
        object.setAttribute("y", `${objectState.y}`);
        object.setAttribute("style", `fill: ${objectColor(objectState, state)}; stroke: ${objectColor(objectState, state)}; stroke-width: 1px;`);
      } else {
        // If the object does not exist, create it
        const object = document.createElementNS(canvas.namespaceURI, "rect");
        object.setAttribute("id", `${objectState.id}`)
        object.setAttribute("width", `${objectState.width}`);
        object.setAttribute("height", `${objectState.height}`);
        object.setAttribute("x", `${objectState.x}`);
        object.setAttribute("y", `${objectState.y}`);
        object.setAttribute("style", `fill: ${objectColor(objectState, state)}; stroke: ${objectColor(objectState, state)}; stroke-width: 1px;`);
        // Put bird above everything else (i.e. Frogger)
        if (isFlower(objectState)) {
          foregroundLayer?.appendChild(object);
        } else {
          backgroundLayer?.appendChild(object);
        }
      }
    })

    // Points text
    const POINTS_TEXT = document.getElementById("pointsText");
    if (POINTS_TEXT) {
      POINTS_TEXT.innerHTML = "Score: " + state.points;
    } else {
      const POINTS_TEXT = document.createElementNS(canvas.namespaceURI, "text");
      POINTS_TEXT.setAttribute("id", "pointsText");
      POINTS_TEXT.setAttribute("font-size", "20");
      POINTS_TEXT.setAttribute("x", "10");
      POINTS_TEXT.setAttribute("y", "580");
      POINTS_TEXT.setAttribute("style", "fill: white");
      POINTS_TEXT.innerHTML = "Points: " + state.points;
      canvas.appendChild(POINTS_TEXT);
    }

    // Lives text
    const LIVES_TEXT = document.getElementById("livesText");
    if (LIVES_TEXT) {
      LIVES_TEXT.innerHTML = "Lives: " + state.lives;
    } else {
      const LIVES_TEXT = document.createElementNS(canvas.namespaceURI, "text");
      LIVES_TEXT.setAttribute("id", "livesText");
      LIVES_TEXT.setAttribute("font-size", "20");
      LIVES_TEXT.setAttribute("x", "130");
      LIVES_TEXT.setAttribute("y", "580");
      LIVES_TEXT.setAttribute("style", "fill: white");
      LIVES_TEXT.innerHTML = "Points: " + state.lives;
      canvas.appendChild(LIVES_TEXT);
    }

    // High score text
    const HIGH_SCORE_TEXT = document.getElementById("highScoreText");
    if (HIGH_SCORE_TEXT) {
      HIGH_SCORE_TEXT.innerHTML = "High Score: " + state.highScore;
    } else {
      const HIGH_SCORE_TEXT = document.createElementNS(canvas.namespaceURI, "text");
      HIGH_SCORE_TEXT.setAttribute("id", "highScoreText");
      HIGH_SCORE_TEXT.setAttribute("font-size", "20");
      HIGH_SCORE_TEXT.setAttribute("x", "430");
      HIGH_SCORE_TEXT.setAttribute("y", "580");
      HIGH_SCORE_TEXT.setAttribute("style", "fill: white");
      HIGH_SCORE_TEXT.innerHTML = "Points: " + state.highScore;
      canvas.appendChild(HIGH_SCORE_TEXT);
    }

    // Frogger
    const circle = document.getElementById("circle");
    if (circle) {
      // If Frogger exists, update its position
      circle.setAttribute("cx", `${state.frogger.x}`)
      circle.setAttribute("cy", `${state.frogger.y}`)
    } else {
      // If Frogger does not exist, create it
      const circle = document.createElementNS(canvas.namespaceURI, "circle");
      circle.setAttribute("id", "circle")
      circle.setAttribute("r", `${state.frogger.radius}`);
      circle.setAttribute(
        "style",
        "fill: limegreen; stroke-width: 0px;"
      );
      circle.setAttribute("cx", `${state.frogger.x}`);
      circle.setAttribute("cy", `${state.frogger.y}`);
      backgroundLayer?.appendChild(circle);
    }

  }

  function detectCollision(frogger: Frogger, object: Object): Boolean {
    /*
    This function checks whether frogger has collided with a given object.
    Inputs:
    - frogger (Frogger): the frogger
    - object (Object): the object

    Output: Boolean of whether the frogger and object have collided or not
    */
    // Collision strictness is a range from 0 to 1 of how strict the collision is.
    // Collision strictness is set to 1 for when the object is a flower.
    const COLLISION_STRICTNESS = isFlower(object) ? 1 : 0.5
    // Check x
    if (frogger.x > object.x - frogger.radius*COLLISION_STRICTNESS && frogger.x < object.x + object.width + frogger.radius*COLLISION_STRICTNESS) {
      // Check y
      if (frogger.y > object.y - frogger.radius*COLLISION_STRICTNESS && frogger.y < object.y + object.height + frogger.radius*COLLISION_STRICTNESS) {
        // There is a collision!!
        return true;
      }
    }
    return false;
  }

  function die(state: State): State {
    /*
    This function is called whenever Frogger dies. It reduces the lives by 1 or restarts the game if there are no lives left.
    Inputs:
    - state (State): the current state
    Output: the resulting State
    */
    if (state.lives > 1) {
      // There are lives left, so reset frogger's position and lose a life
      return {...state,
        lives: state.lives - 1,
        frogger: INITIAL_STATE.frogger,
        objects: state.objects.map((x: Object) => {
          if (x.beingCarried) {
            // Frogger no longer carries the flower
            return {...x,
              beingCarried: false
            }
          }
          return x;
        })
      }
    } else {
      // There are no lives left, so restart the game but update the high score
      return {...INITIAL_STATE,
        highScore: state.points > state.highScore ? state.points : state.highScore
      };
    }
  }

  function resolveSingleCollision(state: State, object: Object): State {
    /*
    This function returns the state after a collision is handled.
    Inputs:
    - state (State): The current state
    - object (Object): The object that is in collision with Frogger
    Output: A State object
    */
    if (object.collidable) {
      // The object is collidable, so Frogger dies
      return die(state);
    } else if (object.ridable) {
      // The frog is on a ridable object!
      // Move the frog with the object
      // Kill the frog if it goes over the canvas while riding
      if (state.frogger.x + state.frogger.radius > state.canvas.width || state.frogger.x - state.frogger.radius < 0) {
        // Frogger fell off the edge, so Frogger dies
        return die(state);
      } else {
        // Move Frogger with the ridable object
        return {...state,
          frogger: {...state.frogger,
            x: state.frogger.x + object.movement[0]
          }
        };
      }
    } else if (object.end) {
      // The frog has reached the end!
      // Send frog back to start
      // If this is not the last target to reach, change the current target

      // Check if the end square has a fly
      const hasFly = state.objects.filter((o: Object) => isFly(o) && o.x > object.x && o.x < object.x + object.width).length > 0;

      // Calculate points gained
      const pointsGain = hasFly ?
        state.objects.filter((o: Object) => o.beingCarried).length > 0 ?
          145 :
          95 :
          state.objects.filter((o: Object) => o.beingCarried).length > 0 ?
            95 :
            45;

      return {...state,
        points: state.points + pointsGain, // Add points
        endsFilled: state.endsFilled + 1, // Record a filled target
        frogger: INITIAL_STATE.frogger, // Return frogger back to initial position
        objects: state.objects.map((x: Object) => {
          if (x === object) {
            // Change target square to water
            const waterColor = objectColor(state.objects.filter((o: Object) => o.id.includes("water"))[0], state);
            return {...object,
              collidable: true,
              end: false,
              color: [waterColor]
            }
          } else if ((hasFly && isFly(x)) || (isFlower(x) && x.beingCarried)) {
            // Remove fly and flower from view if they are reached
            return {...x,
              beingCarried: false,
              x: 9999
            }
          }
          return x;
        })
      }
    } else if (isFlower(object)) {
      // The frog grabs the flower
      return {...state,
        objects: state.objects.map((o: Object) => {
          if (isFlower(o)) {
            return {...object,
              beingCarried: true,
              x: state.frogger.x - 0.5*object.width,
              y: state.frogger.y - 0.5*object.height,
              movement: [0, 0]
            }
          } else {
            return o;
          }
        })
      }
    }
    return state;
  }

  function updateStage(state: State): State {
    /*
    This function sets the state to the next stage.
    Inputs:
    - state (State): the state to be updated
    Output: A State object
    */
    if (state.endsFilled === 5) {
      return {...state,
        stage: state.stage + 1,
        endsFilled: 0,
        objects: INITIAL_STATE.objects.map((object) => {
          if (isBird(object)) {
            return {...object,
              movement: object.movement.map((num: number) => num*2*(state.stage + 1)),
              width: object.width*1.5*(state.stage + 1),
              height: object.height*1.5*(state.stage + 1)
            }
          } else {
            return {...object,
              movement: object.movement.map((num: number) => num*1.25*(state.stage + 1))
            }
          }
        })
      }
    } else {
      return state;
    }
  }

  function resolveCollisions(state: State): State {
    /*
    This function returns the state after all collisions have been resolved.
    Inputs:
    - State (State): The current state
    Output: A State object
    */

    // Update the state for each object
    return state.objects.reduce(((state, object) => {
      // Check for collision
      if (detectCollision(state.frogger, object)) {
        // If there is a collision, resolve the collision
        return resolveSingleCollision(state, object)
      } else {
        // If there is no collision, no change is needed
        return state
      }
    }), state);
  }

  function resolveRandomEvents(state: State): State {
    // Check if the RNG class has been instantiated
    if (state.rng) {

      // Generate random numbers
      const randomFloat = state.rng.nextFloat();
      const randomInt = randomFloat * (state.rng.m - 1);

      // Bird    
      if (state.elapsed % 60 === 50) {
        return {...state,
          // Update random number seed
          rng: new RNG(randomInt),
          objects: state.objects.map((object: Object) => {
            if (isBird(object)) {
              return {...object,
                // If bird hasn't been spawned on the screen, then spawn it
                x: object.x > state.canvas.width ?
                  randomInt % state.canvas.width :
                  object.x,
                y: object.x > state.canvas.width ?
                  (50 + ((randomInt*randomInt) % (state.canvas.height/2))) :
                  object.y,
                // Randomly set movement direction
                movement: [randomFloat < 0.1 ?
                  0 :
                  0.5*(state.stage + 1)*(-1)**(Math.round(new RNG(randomInt).nextFloat()*10)),
                  randomFloat < 0.1 ?
                  0 :
                  0.5*(state.stage + 1)*(-1)**(Math.round(new RNG(randomInt).nextFloat()*999))
                ]
              }
            } else {
              return object
            }
          })
        }
      }
      // Fly
      else if (state.elapsed % 300 === 171) {
        return {...state,
          // Update random number seed
          rng: new RNG(randomInt),
          objects: state.objects.map((object: Object) => {
            if (isFly(object)) {
              // Update fly

              // Possible fly positions (on end squares)
              const availableXPositions = state.objects.filter((o: Object) => o.end).map((o: Object) => o.x + 0.5*o.width - 0.5*object.width);

              // Move fly to a random end square or off the canvas
              return {...object,
                x: randomFloat < 0.5 ?
                  availableXPositions[randomInt % availableXPositions.length] :
                  999
              }
            } else {
              return object
            }
          })          
        }
      }
      // Flower
      else if (state.elapsed % 60 === 43) {
        return {...state,
          // Update random number seed
          rng: new RNG(randomInt),
          objects: state.objects.map((object: Object) => {
            if (isFlower(object)) {
              return {...object,
                // If the flower hasn't been spawned on the screen, then there is a 5% chance that it is spawned
                x: randomFloat < 0.05 && object.x > state.canvas.width ?
                  randomInt % state.canvas.width :
                  object.x,
                y: object.x > state.canvas.width ?
                  50 + ((randomInt*randomInt) % (state.canvas.height - object.height - 100)) :
                  object.y,
                // Randomly set movement direction
                movement: [randomFloat > 0.1 && object.y < state.canvas.height ?
                  0.5*(state.stage + 1)*(-1)**(Math.round(new RNG(randomInt).nextFloat()*10)) :
                  0,
                0]
              }
            } else {
              return object
            }
          })         
        }
      }
    }
    return state;
  }

  function resolveEvents (state: State, event: Move | Tick): State {
    /*
    This function returns the state after events have been processed.
    Inputs:
    - State: state (the current state)
    - Move | Tick: event (the event that takes place)
    Output: an updated State object
    */
    if (event instanceof Move) {
      // Move the frog and points in a Move event as long as the frog is within boundaries
      if (state.frogger.x + event.x > state.frogger.radius && state.frogger.x + event.x < state.canvas.width - state.frogger.radius && state.frogger.y + event.y > state.frogger.radius && state.frogger.y + event.y < state.canvas.height - state.frogger.radius) {
        return {...state,
          rng: state.rng ? state.rng : new RNG(state.elapsed), // If it is the first move, set the RNG seed to the number of ticks before the first move
          points: state.points + event.points,
          frogger: {...state.frogger,
            x: state.frogger.x + event.x,
            y: state.frogger.y + event.y
          },
          // Move carried objects too
          objects: state.objects.map((object: Object) => {
            if (object.beingCarried) {
              return {...object,
                x: state.frogger.x + event.x,
                y: state.frogger.y + event.y
              }
            } else {
              return object;
            }
          })
        }
      }
    } else if (event instanceof Tick) {
      // Apply all timely events in a Tick event

      // Every 200 frames (3 seconds), submerge/re-emerge the submergible logs
      const waterColor = objectColor(state.objects.filter((o: Object) => o.id.includes("water"))[0], state);
      if (state.elapsed % 200 === 199) {
        
        return {...state,
          elapsed: state.elapsed + 1,
          objects: state.objects.map((object: Object) => {
            if (object.id.includes("submergible")) {
              return {...object,
                collidable: !object.collidable,
                color: object.color[0] === "darkorange" ?
                  [waterColor] :
                  ["orange"]
              }
            } else {
              return object;
            }
          })
        }
      }

      return {...state,
        elapsed: state.elapsed + 1,
        objects: state.objects.map((object) => {
          // Determine new x coordinate for the object (check if the object goes over the canvas)
          const NEW_X = object.x + object.movement[0] > state.canvas.width && object.x < 2000 ?
            -object.width :
              object.x + object.movement[0] + object.width < 0 ?
                state.canvas.width :
                object.x + object.movement[0]
          // Determine new y coordinate for the object (only the bird makes use of this)
          const NEW_Y = object.movement[1] && object.y + object.height + object.movement[1] > state.canvas.height - 50 ?
            state.canvas.height - object.height - 50 :
              object.y + object.movement[1] < 0 ?
                0 :
                object.y + object.movement[1]
          return {
            ...object,
            x: NEW_X,
            // Move the y coordinate for birds
            y: NEW_Y,
            // Set log to dark orange when about to submerge
            color: object.id.includes("submergible") && object.color[0] === "orange" && state.elapsed % 200 > 120 ?
              ["darkorange"] :
              object.color
          }
        })
      }
    }
    return state;
  }

  function reduceState(state: State, event: Move | Tick): State {
    /*
    This function takes a state and an event and returns an updated state (from the event taking place)
    Inputs:
    - State: state (the current state)
    - Move | Tick: event (the event that takes place)
    Output: an updated State object
    */

    // Resolve collisions
    // Then update the stage
    // Then resolve incoming events
    // Then resolve random events
    return resolveRandomEvents(resolveEvents(updateStage(resolveCollisions(state)), event));
  }

  // All observables are merged together. REDUCE_STATE is called to update the state.Then updateView is subscribed to update the HTML.
  merge(tick, moveLeft, moveRight, moveUp, moveDown).pipe(
    scan(reduceState, INITIAL_STATE))
    .subscribe(updateView);

}

// The following simply runs your main function on window load.  Make sure to leave it in place.
if (typeof window !== "undefined") {
  window.onload = () => {
    main();
  };
}
