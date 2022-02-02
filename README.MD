# SelectiveUnrealBloomPass

Selective UnrealBloomPass for three.js

## Description

This is a modification of the UnrealBloomPass for Three.js. This project integrates the selective bloom system as shown in the Three.js selective UnrealBloomPass example into the UnrealBloomPass itself. This simply uses the layers system to designate the object that we wanted to have bloom on. This modified version can also still act the normal UnrealBloomPass.  

### Dependencies
 * Three >= r0.137.5


### Installing

```
 npm i @visualsource/selective-unrealbloompass
```

## Getting Started

### Normal UnrealBloomPass

```
import { SelectiveUnrealBloomPass } from '@visualsource/selective-unrealbloompass';

const bloomPass = new SelectiveUnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85);

...

composer.addPass( bloomPass );

```
### Selective UnrealBloomPass

```
import { SelectiveUnrealBloomPass } from '@visualsource/selective-unrealbloompass';

const BLOOM = 1;

// setup renderer, camera, scene, etc

camera.layers.enable(BLOOM);

const bloomPass = new SelectiveUnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 1.5, 0.4, 0.85, true, BLOOM, scene, camera );

composer.addPass( bloomPass );

// create a object to apply bloom to

object.layers.set(BLOOM);

/// render scene

```

## Examples 

The examples are in the examples folder and are the sample as threejs versions but with the modified UnrealBloomPass.

## Authors

* VisualSource 

## Version History

* 1.0.1
    * Fixed README Typos
* 1.0.0
    * Initial Release


## License

This project is licensed under the MIT License - see the LICENSE file for details

## Acknowledgments

Inspiration, code snippets, etc.
* [Threejs discourse](https://discourse.threejs.org/t/selective-unrealbloompass-issues/9331/12)
* [Threejs UnrealBloomPass example](https://threejs.org/examples/?q=bloom#webgl_postprocessing_unreal_bloom)
* [Threejs Selective UnrealBloomPass example](https://threejs.org/examples/?q=bloom#webgl_postprocessing_unreal_bloom_selective)
* [Threejs UnrealBloomPass src](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/UnrealBloomPass.js)
* [spidersharma](https://pastebin.com/jtk5d30f)
* [dbader](https://github.com/dbader/readme-template)
