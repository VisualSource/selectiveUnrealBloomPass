import {
	AdditiveBlending,
	Color,
	LinearFilter,
	MeshBasicMaterial,
	RGBAFormat,
	ShaderMaterial,
	UniformsUtils,
	Vector2,
	Vector3,
	WebGLRenderTarget,
	Layers
} from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader';
import { LuminosityHighPassShader } from 'three/examples/jsm/shaders/LuminosityHighPassShader';

import unrealbloom_blendVert from './shaders/unrealbloom_blend.vert';
import unrealbloom_blendFrag from './shaders/unrealbloom_blend.frag';

export class SelectiveUnrealBloomPass extends Pass {
	static BlurDirectionX = new Vector2( 1.0, 0.0 );
	static BlurDirectionY = new Vector2( 0.0, 1.0 );
	private bloom_layer = new Layers();
	private save_materials: { [uuid: string]: THREE.Material | THREE.Material[] } = {
        "dark_material": new MeshBasicMaterial({ color: "black" })
    };
	
	// create color only once here, reuse it later inside the render function
	private clearColor: Color = new Color(0,0,0);
	private _oldClearColor: Color = new Color();
	private oldClearAlpha: number = 1;
	//@ts-ignore
	private fsQuad: FullScreenQuad = new FullScreenQuad(null);
	private renderTargetsHorizontal: any[] = [];
	private renderTargetsVertical: any[] = [];
	private nMips: number = 5;
	private renderTargetBright: WebGLRenderTarget;
	private materialHighPassFilter: ShaderMaterial;
	private compositeMaterial: ShaderMaterial;
	private blendMaterial: ShaderMaterial;
	private materialCopy: ShaderMaterial;
	private renderTargetSelectedObjects: WebGLRenderTarget;
	private basic: MeshBasicMaterial = new MeshBasicMaterial();
	private separableBlurMaterials: ShaderMaterial[] = [];
	private bloomTintColors: Vector3[] = [];
	private copyUniforms: any;
	private highPassUniforms: any;
	constructor(
		public resolution: Vector2 = new Vector2( 256, 256 ),
		public strength: number = 1,
		public radius: number = 0,
		public threshold: number = 0,
		public selective: boolean = false,
		bloomlayer: number = 0,
		public scene?: THREE.Scene,
		public camera?: THREE.Camera
	){
		super();

		this.bloom_layer.set(bloomlayer);

		const pars = { minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat };

		let resx = Math.round( this.resolution.x / 2 );
		let resy = Math.round( this.resolution.y / 2 );

		this.renderTargetSelectedObjects = new WebGLRenderTarget( resx, resy, pars );
		this.renderTargetSelectedObjects.texture.name = "UnrealBloomPass.selectedObjects";
		this.renderTargetSelectedObjects.texture.generateMipmaps = false;

		this.renderTargetBright = new WebGLRenderTarget( resx, resy, pars );
		this.renderTargetBright.texture.name = 'UnrealBloomPass.bright';
		this.renderTargetBright.texture.generateMipmaps = false;

		for ( let i = 0; i < this.nMips; i ++ ) {

			const renderTargetHorizonal = new WebGLRenderTarget( resx, resy, pars );

			renderTargetHorizonal.texture.name = 'UnrealBloomPass.h' + i;
			renderTargetHorizonal.texture.generateMipmaps = false;

			this.renderTargetsHorizontal.push( renderTargetHorizonal );

			const renderTargetVertical = new WebGLRenderTarget( resx, resy, pars );

			renderTargetVertical.texture.name = 'UnrealBloomPass.v' + i;
			renderTargetVertical.texture.generateMipmaps = false;

			this.renderTargetsVertical.push( renderTargetVertical );

			resx = Math.round( resx / 2 );

			resy = Math.round( resy / 2 );

		}

		// luminosity high pass material

		if ( LuminosityHighPassShader === undefined )
			console.error( 'THREE.UnrealBloomPass relies on LuminosityHighPassShader' );
		const highPassShader = LuminosityHighPassShader;
		this.highPassUniforms = UniformsUtils.clone( highPassShader.uniforms );
	
		this.highPassUniforms[ 'luminosityThreshold' ].value = threshold;
		this.highPassUniforms[ 'smoothWidth' ].value = 0.01;
	
		this.materialHighPassFilter = new ShaderMaterial( {
			uniforms: this.highPassUniforms,
			vertexShader: highPassShader.vertexShader,
			fragmentShader: highPassShader.fragmentShader,
			defines: {}
		} );

		// Gaussian Blur Materials
		this.separableBlurMaterials = [];
		const kernelSizeArray = [ 3, 5, 7, 9, 11 ];
		resx = Math.round( this.resolution.x / 2 );
		resy = Math.round( this.resolution.y / 2 );

		for ( let i = 0; i < this.nMips; i ++ ) {

			this.separableBlurMaterials.push( this.getSeperableBlurMaterial( kernelSizeArray[ i ] ) );

			this.separableBlurMaterials[ i ].uniforms[ 'texSize' ].value = new Vector2( resx, resy );

			resx = Math.round( resx / 2 );

			resy = Math.round( resy / 2 );

		}

		// Composite material
		this.compositeMaterial = this.getCompositeMaterial( this.nMips );
		this.compositeMaterial.uniforms[ 'blurTexture1' ].value = this.renderTargetsVertical[ 0 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture2' ].value = this.renderTargetsVertical[ 1 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture3' ].value = this.renderTargetsVertical[ 2 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture4' ].value = this.renderTargetsVertical[ 3 ].texture;
		this.compositeMaterial.uniforms[ 'blurTexture5' ].value = this.renderTargetsVertical[ 4 ].texture;
		this.compositeMaterial.uniforms[ 'bloomStrength' ].value = strength;
		this.compositeMaterial.uniforms[ 'bloomRadius' ].value = 0.1;
		this.compositeMaterial.needsUpdate = true;


		const bloomFactors = [ 1.0, 0.8, 0.6, 0.4, 0.2 ];
		this.compositeMaterial.uniforms[ 'bloomFactors' ].value = bloomFactors;
		this.bloomTintColors = [ new Vector3( 1, 1, 1 ), new Vector3( 1, 1, 1 ), new Vector3( 1, 1, 1 ), new Vector3( 1, 1, 1 ), new Vector3( 1, 1, 1 ) ];
		this.compositeMaterial.uniforms[ 'bloomTintColors' ].value = this.bloomTintColors;


		this.blendMaterial = this.createBlendMaterial();

		// copy material
		if ( CopyShader === undefined ) {

			console.error( 'THREE.UnrealBloomPass relies on CopyShader' );

		}

		const copyShader = CopyShader;

		this.copyUniforms = UniformsUtils.clone( copyShader.uniforms );
		this.copyUniforms[ 'opacity' ].value = 1.0;

		this.materialCopy = new ShaderMaterial( {
			uniforms: this.copyUniforms,
			vertexShader: copyShader.vertexShader,
			fragmentShader: copyShader.fragmentShader,
			blending: AdditiveBlending,
			depthTest: false,
			depthWrite: false,
			transparent: true
		} );

		this.enabled = true;
		this.needsSwap = false;
	}
	public dispose() {
		for ( let i = 0; i < this.renderTargetsHorizontal.length; i ++ ) {

			this.renderTargetsHorizontal[ i ].dispose();

		}
		for ( let i = 0; i < this.renderTargetsVertical.length; i ++ ) {

			this.renderTargetsVertical[ i ].dispose();

		}
		this.renderTargetBright.dispose();

	}
	public setSize( width: number, height: number ) {

		let resx = Math.round( width / 2 );
		let resy = Math.round( height / 2 );

		this.renderTargetBright.setSize( resx, resy );

		for ( let i = 0; i < this.nMips; i ++ ) {

			this.renderTargetsHorizontal[ i ].setSize( resx, resy );
			this.renderTargetsVertical[ i ].setSize( resx, resy );

			this.separableBlurMaterials[ i ].uniforms[ 'texSize' ].value = new Vector2( resx, resy );

			resx = Math.round( resx / 2 );
			resy = Math.round( resy / 2 );

		}

	}
	render( renderer: THREE.WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget, deltaTime: number, maskActive:  boolean ) {

		renderer.getClearColor( this._oldClearColor );
		this.oldClearAlpha = renderer.getClearAlpha();
		const oldAutoClear = renderer.autoClear;
		renderer.autoClear = false;

		renderer.setClearColor( this.clearColor, 0 );

		if ( maskActive ) renderer.state.buffers.stencil.setTest( false );

		// Render input to screen

		if ( this.renderToScreen ) {

			this.fsQuad.material = this.basic;
			this.basic.map = readBuffer.texture;

			renderer.setRenderTarget( null );
			renderer.clear();
			this.fsQuad.render( renderer );

		}

		let applyBuffer = readBuffer;

		if(this.selective && this.scene && this.camera) {
			this.scene.traverse(this.darkenNonBloom)

			renderer.setRenderTarget( this.renderTargetSelectedObjects );
			renderer.clear();
            renderer.render( this.scene, this.camera );

			applyBuffer = this.renderTargetSelectedObjects;

			this.scene.traverse(this.restoreMaterial);
		}

		// 1. Extract Bright Areas

		this.highPassUniforms[ 'tDiffuse' ].value = applyBuffer.texture;
		this.highPassUniforms[ 'luminosityThreshold' ].value = this.threshold;
		this.fsQuad.material = this.materialHighPassFilter;

		renderer.setRenderTarget( this.renderTargetBright );
		renderer.clear();
		this.fsQuad.render( renderer );

		// 2. Blur All the mips progressively

		let inputRenderTarget = this.renderTargetBright;

		for ( let i = 0; i < this.nMips; i ++ ) {

			this.fsQuad.material = this.separableBlurMaterials[ i ];

			this.separableBlurMaterials[ i ].uniforms[ 'colorTexture' ].value = inputRenderTarget.texture;
			this.separableBlurMaterials[ i ].uniforms[ 'direction' ].value = SelectiveUnrealBloomPass.BlurDirectionX;
			renderer.setRenderTarget( this.renderTargetsHorizontal[ i ] );
			renderer.clear();
			this.fsQuad.render( renderer );

			this.separableBlurMaterials[ i ].uniforms[ 'colorTexture' ].value = this.renderTargetsHorizontal[ i ].texture;
			this.separableBlurMaterials[ i ].uniforms[ 'direction' ].value = SelectiveUnrealBloomPass.BlurDirectionY;
			renderer.setRenderTarget( this.renderTargetsVertical[ i ] );
			renderer.clear();
			this.fsQuad.render( renderer );

			inputRenderTarget = this.renderTargetsVertical[ i ];

		}

		// Composite All the mips

		this.fsQuad.material = this.compositeMaterial;
		this.compositeMaterial.uniforms[ 'bloomStrength' ].value = this.strength;
		this.compositeMaterial.uniforms[ 'bloomRadius' ].value = this.radius;
		this.compositeMaterial.uniforms[ 'bloomTintColors' ].value = this.bloomTintColors;

		renderer.setRenderTarget( this.renderTargetsHorizontal[ 0 ] );
		renderer.clear();
		this.fsQuad.render( renderer );


		if(this.selective) {
			this.fsQuad.material = this.blendMaterial;
			this.blendMaterial.uniforms[ 'baseTexture' ].value = readBuffer.texture;
		} else {
			// Blend it additively over the input texture

			this.fsQuad.material = this.materialCopy;
			this.copyUniforms[ 'tDiffuse' ].value = this.renderTargetsHorizontal[ 0 ].texture;
		}

		if ( maskActive ) renderer.state.buffers.stencil.setTest( true );

		if ( this.renderToScreen ) {

			renderer.setRenderTarget( null );
			this.fsQuad.render( renderer );

		} else {

			renderer.setRenderTarget( readBuffer );
			this.fsQuad.render( renderer );

		}

		// Restore renderer settings

		renderer.setClearColor( this._oldClearColor, this.oldClearAlpha );
		renderer.autoClear = oldAutoClear;

	}
	private createBlendMaterial(): ShaderMaterial {
		return new ShaderMaterial({
			uniforms: {
                baseTexture: { value: null },
                bloomTexture: { value: this.renderTargetsHorizontal[ 0 ].texture },
            },
			vertexShader: unrealbloom_blendVert,
			fragmentShader: unrealbloom_blendFrag
		});
	}
	private getCompositeMaterial(nMips: number): ShaderMaterial {
		return new ShaderMaterial( {

			defines: {
				'NUM_MIPS': nMips
			},

			uniforms: {
				'blurTexture1': { value: null },
				'blurTexture2': { value: null },
				'blurTexture3': { value: null },
				'blurTexture4': { value: null },
				'blurTexture5': { value: null },
				'dirtTexture': { value: null },
				'bloomStrength': { value: 1.0 },
				'bloomFactors': { value: null },
				'bloomTintColors': { value: null },
				'bloomRadius': { value: 0.0 }
			},

			vertexShader:
				`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,

			fragmentShader:
				`varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform sampler2D dirtTexture;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`
		} );
	}
	private getSeperableBlurMaterial(kernelRadius: number): ShaderMaterial {
		return new ShaderMaterial( {

			defines: {
				'KERNEL_RADIUS': kernelRadius,
				'SIGMA': kernelRadius
			},

			uniforms: {
				'colorTexture': { value: null },
				'texSize': { value: new Vector2( 0.5, 0.5 ) },
				'direction': { value: new Vector2( 0.5, 0.5 ) }
			},

			vertexShader:
				`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,

			fragmentShader:
				`#include <common>
				varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 texSize;
				uniform vec2 direction;

				float gaussianPdf(in float x, in float sigma) {
					return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
				}
				void main() {
					vec2 invSize = 1.0 / texSize;
					float fSigma = float(SIGMA);
					float weightSum = gaussianPdf(0.0, fSigma);
					vec3 diffuseSum = texture2D( colorTexture, vUv).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianPdf(x, fSigma);
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`
		} );
	}
	private darkenNonBloom = (obj: THREE.Object3D) => {
        if((obj as THREE.Mesh).isMesh && !this.bloom_layer.test(obj.layers)) {
			if(!this.save_materials[obj.uuid]) this.save_materials[obj.uuid] = (obj as THREE.Mesh).material;
            (obj as THREE.Mesh).material = this.save_materials["dark_material"];
        }
    }
    private restoreMaterial = (obj: THREE.Object3D) => {
        if(this.save_materials[obj.uuid]){
            (obj as THREE.Mesh).material = this.save_materials[obj.uuid];
        }
    }
}