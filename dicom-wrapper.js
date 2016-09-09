/* global angular */

'use strict';

angular.module('dercetech.dicom').factory('DicomWrapper',

    ['dcmdict', 'cluts', 'transferSyntaxes', 'is_implicit', 'is_little_endian',

    function(dcmdict, cluts, transferSyntaxes, is_implicit, is_little_endian) {

        ////////////////////////////////////////
        // Canvas Painter //////////////////////

        // Added "canvas" parameter to allow creation within ng directives (added by Jem @Dercetech)
        function CanvasPainter(canvasid, canvas) {
            this.canvas = canvas ? canvas : document.getElementById(canvasid);
            this.tempcanvas = document.createElement("canvas");
            this.ww;
            this.wl;
            this.file;
            this.scale = 1;
            this.pan = [0,0];
        }
        
        CanvasPainter.prototype.set_file = function(file) {
            this.file = file;
        };
        
        CanvasPainter.prototype.set_cluts = function(clut_r, clut_g, clut_b) {
            this.clut_r = clut_r;
            this.clut_g = clut_g;
            this.clut_b = clut_b;
        };
        
        CanvasPainter.prototype.set_windowing = function(wl, ww) {
            this.ww = ww;
            this.wl = wl;
        };
        
        CanvasPainter.prototype.reset_windowing = function() {
            this.ww = 200;
            this.wl = 40;
        };
        
        CanvasPainter.prototype.set_scale = function(scale) {
            this.scale = scale;
            this.draw_image();
        };
        
        CanvasPainter.prototype.get_scale = function(scale) {
            return this.scale;
        };
        
        CanvasPainter.prototype.reset_scale = function(scale) {
            this.scale = 1.0;
        };
        
        CanvasPainter.prototype.get_windowing = function() {
            return [this.wl, this.ww];
        };
        
        CanvasPainter.prototype.set_pan = function(panx, pany) {
            this.pan[0] = panx;
            this.pan[1] = pany;
            this.draw_image();
        };
        
        CanvasPainter.prototype.get_pan = function() {
            return this.pan;
        };
        
        CanvasPainter.prototype.reset_pan = function() {
            this.pan[0] = 0.0;
            this.pan[1] = 0.0;
        };
        
        CanvasPainter.prototype.pan_unit = function() {
            return 1;
        };
        
        CanvasPainter.prototype.init = function() {
        };
        
        CanvasPainter.prototype.onresize = function() {
            this.canvas.width = this.canvas.clientWidth;
            this.canvas.height = this.canvas.clientHeight;
            this.draw_image();
        };
        
        CanvasPainter.prototype.unproject = function(canvas_pos) {
            var canvas_scale = this.canvas.height/this.file.Rows;
            var targetWidth = this.file.Rows*this.scale*canvas_scale;
            var targetHeight = this.file.Columns*this.scale*canvas_scale;
            var xoffset = (this.canvas.width-targetWidth)/2+this.pan[0];
            var yoffset = (this.canvas.height-targetHeight)/2+this.pan[1];
            var imagepos = [0,0];
            var xscale = this.file.Columns/targetWidth;
            var yscale = this.file.Rows/targetHeight;
            imagepos[0] = Math.round((canvas_pos[0]-xoffset)*xscale);
            imagepos[1] = Math.round((canvas_pos[1]-yoffset)*yscale);//*(this.canvas.height/targetHeight);
            return imagepos;
        };
        
        CanvasPainter.prototype.image_coords_to_row_column = function(pt) {
            return [pt[0], pt[1]];
        };
        
        CanvasPainter.prototype.draw_image = function() {
            if(this.file == undefined)
                return;
            var ctx = this.canvas.getContext("2d");
            ctx.fillStyle = "rgb(0,0,0)";
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
            this.tempcanvas.width = this.file.Rows;
            this.tempcanvas.height = this.file.Columns;
            var tempctx = this.tempcanvas.getContext("2d");
        
            var imageData = tempctx.createImageData(this.file.Columns, this.file.Rows);
            
            var lower_bound = this.wl - this.ww/2.0;
            var upper_bound = this.wl + this.ww/2.0;
            for(var row=0;row<this.file.Rows;++row) {
                for(var col=0;col<this.file.Columns;++col) {
                    var data_idx = (col + row*this.file.Columns);
                    var intensity = this.file.PixelData[data_idx];
                    intensity = intensity * this.file.RescaleSlope + this.file.RescaleIntercept;
                    intensity = (intensity - lower_bound)/(upper_bound - lower_bound);
                    if(intensity < 0.0)
                        intensity = 0.0;
                    if(intensity > 1.0)
                        intensity = 1.0;
        
                    intensity *= 255.0;
        
                    var canvas_idx = (col + row*this.file.Columns)*4;
                    var rounded_intensity = Math.round(intensity);
                    imageData.data[canvas_idx] = this.clut_r[rounded_intensity];
                    imageData.data[canvas_idx+1] = this.clut_g[rounded_intensity];
                    imageData.data[canvas_idx+2] = this.clut_b[rounded_intensity];
                    imageData.data[canvas_idx+3] = 0xFF;
                }
            }
            tempctx.putImageData(imageData, 0, 0);
        
            var canvas_scale = this.canvas.height/this.file.Rows;
            var targetWidth = this.file.Rows*this.scale*canvas_scale;
            var targetHeight = this.file.Columns*this.scale*canvas_scale;
            var xoffset = (this.canvas.width-targetWidth)/2;
            var yoffset = (this.canvas.height-targetHeight)/2;
            ctx.drawImage(this.tempcanvas, xoffset+this.pan[0], yoffset+this.pan[1], targetWidth, targetHeight);
        };
        
        CanvasPainter.prototype.canvas_scale = function() {
            return this.canvas.height/this.file.Rows;
        };
        
        CanvasPainter.prototype.target_height = function(canvas_scale) {
            return this.file.Columns*this.scale*canvas_scale;
        };
        
        CanvasPainter.prototype.target_width = function(canvas_scale) {
            return this.file.Columns*this.scale*canvas_scale;
        };

        // Canvas Painter //////////////////////
        ///////////////////////////////////////

        ////////////////////////////////////////
        // Shaders /////////////////////////////
        
        var fragment_shader_8 = "\
        \
        varying highp vec2 vTextureCoord;\
        uniform sampler2D uSampler;\
        uniform highp float uWW;\
        uniform highp float uWL;\
        uniform highp float uRS;\
        uniform highp float uRI;\
        uniform highp float uAlpha;\
        uniform sampler2D uClutSampler;\
        \
        void main(void) {  \
            highp vec4 texcolor = texture2D(uSampler, vTextureCoord); \
            highp float intensity = texcolor.r*65536.0;\
            highp float lower_bound = (uWW * -0.5) + uWL; \
            highp float upper_bound = (uWW *  0.5) + uWL; \
            intensity = (intensity - lower_bound)/(upper_bound - lower_bound);\
        \
            gl_FragColor = vec4(intensity, intensity, intensity, uAlpha);\
        }";
        
        var fragment_shader_16 = "\
        \
        varying highp vec2 vTextureCoord;\
        uniform sampler2D uSampler;\
        uniform sampler2D uClutSampler;\
        uniform highp float uWW;\
        uniform highp float uWL;\
        uniform highp float uRS;\
        uniform highp float uRI;\
        uniform highp float uAlpha;\
        \
        void main(void) {  \
            highp vec4 texcolor = texture2D(uSampler, vTextureCoord); \
            highp float intensity = texcolor.r*256.0 + texcolor.a*65536.0;\
            highp float rescaleIntercept = uRI;\
            highp float rescaleSlope = uRS;\
            intensity = intensity * rescaleSlope + rescaleIntercept;\
            highp float lower_bound = (uWW * -0.5) + uWL; \
            highp float upper_bound = (uWW *  0.5) + uWL; \
            intensity = (intensity - lower_bound)/(upper_bound - lower_bound);\
            highp vec4 clutcolor = texture2D(uClutSampler, vec2(intensity, intensity)); \
            gl_FragColor = vec4(clutcolor.r, clutcolor.g, clutcolor.b, uAlpha);\
        }";
        
        var fragment_shader_rgb_8 = "\
        varying highp vec2 vTextureCoord;\
        uniform sampler2D uSampler;\
        uniform highp float uAlpha;\
        \
        void main()\
        {\
            highp vec4 texcolor = texture2D(uSampler, vTextureCoord); \
            gl_FragColor = vec4(texcolor.r, texcolor.g, texcolor.b, 1.0);\
        }";
        
        
        var vertex_shader = "\
        attribute vec3 aVertexPosition;\
        attribute vec2 aTextureCoord;\
        \
        uniform mat4 uMVMatrix;\
        uniform mat4 uPMatrix;\
        \
        varying highp vec2 vTextureCoord;\
        \
        void main(void) {\
            gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);\
            vTextureCoord = aTextureCoord;\
        }";
        
        // Shaders /////////////////////////////
        ////////////////////////////////////////


        ////////////////////////////////////////
        // GL Painter //////////////////////////

        var FRAG_SHADER_8 = 0;
        var FRAG_SHADER_16 = 1;
        var FRAG_SHADER_RGB_8 = 2;
        
        function ImageSlice(file, texture, rs, ri, alpha) {
            this.file = file;
            this.texture = texture;
            this.rs = rs;
            this.ri = ri;
            this.alpha = alpha;
        }
        
        // Added "canvas" parameter to allow creation within ng directives (added by Jem @Dercetech)
        function GLPainter(canvasid, canvas) {
            this.canvas = canvas ? canvas : document.getElementById(canvasid);
            this.gl;
            this.shaderProgram;
            this.mvMatrix = mat4.create();
            this.pMatrix = mat4.create();
            this.squareVertexPositionBuffer;
            this.vertexIndexBuffer;
            //this.THE_TEXTURE;
            this.CLUT_TEXTURE;
        
            this.ww = 200;
            this.wl = 40;
            this.clut_r;
            this.clut_g;
            this.clut_b;
            this.ztrans = -1;
            this.xtrans = 0.0;
            this.ytrans = 0.0;
            this.fovy = 90;
            this.scale = 1;
            this.pan = [0,0];
        
            this.images = [];
            this.shaderPrograms = {};
            this.clut_bar_enabled = false;
        }
        
        GLPainter.prototype.fuse_files = function(file1, file2, alpha) {
            this.images.length = 0;
            this.images.push(new ImageSlice(file1,
                                            this.file_to_texture(file2),
                                            file2.RescaleSlope || 1.0,
                                            file2.RescaleIntercept || 0.0,
                                            1.0));
            this.images.push(new ImageSlice(file2,
                                            this.file_to_texture(file1),
                                            file1.RescaleSlope || 1.0,
                                            file1.RescaleIntercept || 0.0,
                                            alpha));
            this.rows = file1.Rows;
            this.columns = file1.Columns;
        };
        
        GLPainter.prototype.set_file = function(dcmfile) {
            this.images = [new ImageSlice(dcmfile,
                                          this.file_to_texture(dcmfile), 
                                          dcmfile.RescaleSlope || 1.0, 
                                          dcmfile.RescaleIntercept || 0.0,
                                          1.0)];
            this.rows = dcmfile.Rows;
            this.columns = dcmfile.Columns;
            //this.THE_TEXTURE = this.file_to_texture(dcmfile);
        };
        
        GLPainter.prototype.file_to_texture = function(dcmfile) {
            var internalFormat;
            //var raw_data = dcmfile.get_element(dcmdict.PixelData).data;
            switch(jQuery.trim(dcmfile.PhotometricInterpretation)) {
            case "MONOCHROME1":
                // TODO: MONOCHROME1 should use inverse cluts.
            case "MONOCHROME2":
                if(dcmfile.BitsStored <= 8) {
                    internalFormat = this.gl.LUMINANCE;
                } else {
                    internalFormat = this.gl.LUMINANCE_ALPHA;
                    if(dcmfile.PixelRepresentation == 0x01) {
                        if(!dcmfile._TwoCompPatched) {
                            for(var i=0;i<dcmfile.PixelData.length;++i) {
                                dcmfile.PixelData[i] = dcmfile.PixelData[i] ^ (0x1 << dcmfile.HighBit);
                            }
                            dcmfile._TwoCompPatched = true;
                        }
                    }
                }
                break;
            case "RGB":
                internalFormat = this.gl.RGB;
                break;
            default:
                alert("Unknown Photometric Interpretation" + dcmfile.PhotometricInterpretation + "!");
                return;
            }
        
            var texture = this.gl.createTexture(); 
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);  
            this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
            this.gl.texImage2D(this.gl.TEXTURE_2D,       // target
                               0,                        // level
                               internalFormat,           // internalformat
                               dcmfile.Columns,          // width
                               dcmfile.Rows,             // height 
                               0,                        // border
                               internalFormat,           // format
                               this.gl.UNSIGNED_BYTE,    // type
                               dcmfile.get_element(dcmdict.PixelData).data);// Get raw Uint8array
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
                          
            this.gl.bindTexture(this.gl.TEXTURE_2D, null);
            return texture;
        };
        
        
        GLPainter.prototype.set_scale = function(scale) {
            this.scale = Math.min(Math.max(scale, 0.1), 10.0);
            this.draw_image();
        };
        
        GLPainter.prototype.get_scale = function(scale) {
            return this.scale;
        };
        
        GLPainter.prototype.reset_scale = function(scale) {
            this.scale = 1.0;
        };
        
        GLPainter.prototype.set_pan = function(panx, pany) {
            this.pan[0] = panx;
            this.pan[1] = pany;
            this.draw_image();
        };
        
        GLPainter.prototype.get_pan = function() {
            return this.pan;
        };
        
        GLPainter.prototype.reset_pan = function() {
            this.pan[0] = 0.0;
            this.pan[1] = 0.0;
        };
        
        GLPainter.prototype.reset_windowing = function() {
            this.ww = 200;
            this.wl = 40;
        };
        
        GLPainter.prototype.set_cluts = function(clut_r, clut_g, clut_b) {
            this.clut_r = clut_r;
            this.clut_g = clut_g;
            this.clut_b = clut_b;
            if(!this.gl)
                return;
        
            // Re-pack as rgb
            var rgb_clut = new Uint8Array(256*3);
            for(var i=0;i<256;++i) {
                rgb_clut[i*3] = this.clut_r[i];
                rgb_clut[i*3 + 1] = this.clut_g[i];
                rgb_clut[i*3 + 2] = this.clut_b[i];
            }
        
            this.CLUT_TEXTURE = this.gl.createTexture();
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.CLUT_TEXTURE);
            this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
            this.gl.texImage2D(this.gl.TEXTURE_2D,       // target
                               0,                        // level
                               this.gl.RGB,              // internalformat
                               256,                      // width
                               1,                        // height 
                               0,                        // border
                               this.gl.RGB,             // format
                               this.gl.UNSIGNED_BYTE,    // type
                               rgb_clut);                // data
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        
            this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        };
        
        GLPainter.prototype.set_windowing = function(wl, ww) {
            this.wl = wl;
            this.ww = ww;
        };
        
        GLPainter.prototype.get_windowing = function() {
            return [this.wl, this.ww];
        };
        
        GLPainter.prototype.unproject = function(canvas_pos) {
            var viewportArray = [
                0, 0, this.gl.viewportWidth, this.gl.viewportHeight
            ];
            
            var projectedPoint = [];
            var unprojectedPoint = [];
            
            var flippedmvMatrix = mat4.create();
        
            mat4.identity(flippedmvMatrix);
            mat4.translate(flippedmvMatrix, [this.pan[0], this.pan[1], -1]);
            mat4.scale(flippedmvMatrix, [this.scale,this.scale,this.scale]);
        
            // Hack to fit image if height is greater than width
            if(this.canvas.height > this.canvas.width) {
                var canvas_scale = this.canvas.width/this.canvas.height;
                mat4.scale(flippedmvMatrix, [canvas_scale,canvas_scale,canvas_scale]);
            }
        
            GLU.project(
                0,0,0,
                flippedmvMatrix, this.pMatrix,
                viewportArray, projectedPoint);
            
            var successFar = GLU.unProject(
                canvas_pos[0], canvas_pos[1], projectedPoint[2], //windowPointX, windowPointY, windowPointZ,
                flippedmvMatrix, this.pMatrix,
                viewportArray, unprojectedPoint);
        
            return unprojectedPoint;
        };
        
        GLPainter.prototype.image_coords_to_row_column = function(pt) {
            return [Math.round((pt[0]+1)/2*this.columns), Math.round((pt[1]+1)/2*this.rows)];
        };
        
        GLPainter.prototype.unproject_row_column = function(canvas_pos) {
            var unprojectedPoint = this.unproject(canvas_pos);
            return image_coords_to_row_column(unprojectedPoint);;
        };
        
        GLPainter.prototype.update_projection_matrix = function() {
            mat4.perspective(this.fovy, this.gl.viewportWidth / this.gl.viewportHeight, 0.1, 100.0, this.pMatrix);
            mat4.identity(this.mvMatrix);
            mat4.translate(this.mvMatrix, [this.pan[0], -this.pan[1], -1]);
            mat4.scale(this.mvMatrix, [this.scale,this.scale,this.scale]);
        
            // Hack to fit image if height is greater than width
            if(this.canvas.height > this.canvas.width) {
                var canvas_scale = this.canvas.width/this.canvas.height;
                mat4.scale(this.mvMatrix, [canvas_scale,canvas_scale,canvas_scale]);
            }
        };
        
        GLPainter.prototype.draw_clut_bar = function() {
            if(!this.clut_bar_enabled)
                return;
            // Draw clut bar
            this.gl.viewport(10, 10, 50, this.canvas.height-100);
            var pMatrix = mat4.create();
            mat4.perspective(this.fovy, this.gl.viewportWidth / this.gl.viewportHeight, 0.1, 100.0, pMatrix);
            var mvMatrix = mat4.create();
            mat4.identity(mvMatrix);
            mat4.translate(mvMatrix, [0,0,-1]);
            mat4.scale(mvMatrix, [20,1,1]);
            mat4.rotate(mvMatrix, Math.PI/2, [0,0,1]);
        
            var shaderProgram = this.shaderPrograms[FRAG_SHADER_RGB_8];
            this.gl.useProgram(shaderProgram);
        
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.squareVertexPositionBuffer);
            this.gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute,
                                        this.squareVertexPositionBuffer.itemSize,
                                        this.gl.FLOAT,
                                        false,
                                        0,
                                        0);
        
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);
            this.gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, this.textureCoordBuffer.itemSize, this.gl.FLOAT, false, 0, 0);
        
            // Clut texture
            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.CLUT_TEXTURE);
            this.gl.uniform1i(shaderProgram.samplerUniform, 0);
        
            this.gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, pMatrix);
            this.gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, mvMatrix);
        
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.vertexIndexBuffer);
            this.gl.drawElements(this.gl.TRIANGLES, this.vertexIndexBuffer.numItems, this.gl.UNSIGNED_SHORT, 0);
            this.gl.viewport(0,0, this.canvas.width, this.canvas.height);
        };
        
        GLPainter.prototype.draw_image = function() {
            this.gl.viewport(0, 0, this.gl.viewportWidth, this.gl.viewportHeight);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
            //this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        
            this.gl.disable(this.gl.BLEND);
            this.draw_clut_bar();
        
            this.gl.enable(this.gl.BLEND);
            this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE);
        
            for(var imgidx in this.images) {
                this.update_projection_matrix();
                var image = this.images[imgidx];
                if(image.file.PixelAspectRatio != undefined) {
                    mat4.scale(this.mvMatrix, [100/image.file.PixelAspectRatio, 1, 1]);
                }
        
                var shaderProgram;
                switch(jQuery.trim(image.file.PhotometricInterpretation)) {
                    case "MONOCHROME1":
                        // TODO: MONOCHROME1 should use inverse cluts.
                    case "MONOCHROME2":
                        if(image.file.BitsStored <= 8) {
                            shaderProgram = this.shaderPrograms[FRAG_SHADER_8];
                        } else {
                            shaderProgram = this.shaderPrograms[FRAG_SHADER_16];
                        }
                        break;
                    case "RGB":
                        shaderProgram = this.shaderPrograms[FRAG_SHADER_RGB_8];
                        break;
                    default:
                        alert("Unknown Photometric Interpretation" + image.file.PhotometricInterpretation + "!");
                        return;
                }
                this.gl.useProgram(shaderProgram);
        
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.squareVertexPositionBuffer);
                this.gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, 
                                       this.squareVertexPositionBuffer.itemSize, 
                                       this.gl.FLOAT, 
                                       false, 
                                       0, 
                                       0);
        
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);
                this.gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, this.textureCoordBuffer.itemSize, this.gl.FLOAT, false, 0, 0);
        
                this.gl.activeTexture(this.gl.TEXTURE0);  
                this.gl.bindTexture(this.gl.TEXTURE_2D, image.texture);  
                this.gl.uniform1i(shaderProgram.samplerUniform, 0);
        
                // Clut texture
                this.gl.activeTexture(this.gl.TEXTURE1);
                this.gl.bindTexture(this.gl.TEXTURE_2D, this.CLUT_TEXTURE);
                this.gl.uniform1i(shaderProgram.clutSamplerUniform, 1);
        
                this.set_matrix_uniforms(shaderProgram);
                this.set_window_uniforms(shaderProgram, image);
        
                this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.vertexIndexBuffer);
                this.gl.drawElements(this.gl.TRIANGLES, this.vertexIndexBuffer.numItems, this.gl.UNSIGNED_SHORT, 0);
            }
        
        
        };
        
        GLPainter.prototype.init = function(canvasid, preserveDrawingBuffer) {
        
            // Initialize main gl-canvas
            
            // The context should be set so that preserveDrawingBuffer makes it not trash its rendering pipeline(added by Jem @Dercetech)
            // http://stackoverflow.com/questions/32556939/saving-canvas-to-image-via-canvas-todataurl-results-in-black-rectangle
            this.gl = this.canvas.getContext("experimental-webgl", {"preserveDrawingBuffer": preserveDrawingBuffer});
            this.gl.viewportWidth = this.canvas.width;
            this.gl.viewportHeight = this.canvas.height;
        
        
            this.init_shaders();
            this.init_buffers();
            this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
            //this.gl.enable(this.gl.DEPTH_TEST);
        
            if (!this.gl) {
                throw "No GL-context";
            }
        };
        
        GLPainter.prototype.onresize = function() {
            this.gl.viewportWidth = this.canvas.clientWidth;
            this.gl.viewportHeight = this.canvas.clientHeight;
            this.draw_image();
        };

        GLPainter.prototype.compile_shader = function(str, shader_type) {
        
            var shader = this.gl.createShader(shader_type);
        
            this.gl.shaderSource(shader, str);
            this.gl.compileShader(shader);
        
            if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
                alert(this.gl.getShaderInfoLog(shader));
                return null;
            }
            return shader;
        
        };
        
        GLPainter.prototype.init_shaders = function() {
            var fragmentShader8 = this.compile_shader(fragment_shader_8, this.gl.FRAGMENT_SHADER);
            var fragmentShader16 = this.compile_shader(fragment_shader_16, this.gl.FRAGMENT_SHADER);
            var fragmentShaderRGB8 = this.compile_shader(fragment_shader_rgb_8, this.gl.FRAGMENT_SHADER);
            var vertexShader = this.compile_shader(vertex_shader, this.gl.VERTEX_SHADER);
        
            this.shaderPrograms[FRAG_SHADER_8] = this.create_shader_program(fragmentShader8, vertexShader);
            this.shaderPrograms[FRAG_SHADER_16] = this.create_shader_program(fragmentShader16, vertexShader);
            this.shaderPrograms[FRAG_SHADER_RGB_8] = this.create_shader_program(fragmentShaderRGB8, vertexShader);
        };
        
        GLPainter.prototype.create_shader_program = function(fragshader, vertshader) {
            var shaderProgram = this.gl.createProgram();
            this.gl.attachShader(shaderProgram, vertshader);
            this.gl.attachShader(shaderProgram, fragshader);
            this.gl.linkProgram(shaderProgram);
        
            if (!this.gl.getProgramParameter(shaderProgram, this.gl.LINK_STATUS)) {
                alert("Could not initialise shaders");
            }
        
            shaderProgram.vertexPositionAttribute = this.gl.getAttribLocation(shaderProgram, "aVertexPosition");
            this.gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
            shaderProgram.textureCoordAttribute = this.gl.getAttribLocation(shaderProgram, "aTextureCoord");  
            this.gl.enableVertexAttribArray(shaderProgram.textureCoordAttribute); 
        
            shaderProgram.pMatrixUniform = this.gl.getUniformLocation(shaderProgram, "uPMatrix");
            shaderProgram.mvMatrixUniform = this.gl.getUniformLocation(shaderProgram, "uMVMatrix");
            shaderProgram.samplerUniform = this.gl.getUniformLocation(shaderProgram, "uSampler");
            shaderProgram.clutSamplerUniform = this.gl.getUniformLocation(shaderProgram, "uClutSampler");
        
            shaderProgram.wlUniform = this.gl.getUniformLocation(shaderProgram, "uWL");
            shaderProgram.wwUniform = this.gl.getUniformLocation(shaderProgram, "uWW");
            shaderProgram.riUniform = this.gl.getUniformLocation(shaderProgram, "uRI");
            shaderProgram.rsUniform = this.gl.getUniformLocation(shaderProgram, "uRS");
            shaderProgram.alphaUniform = this.gl.getUniformLocation(shaderProgram, "uAlpha");
            return shaderProgram;
        };
        
        GLPainter.prototype.set_matrix_uniforms = function(shaderProgram) {
            this.gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, this.pMatrix);
            this.gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, this.mvMatrix);
        };
        
        GLPainter.prototype.set_window_uniforms = function(shaderProgram, image) {
            // Hack for files with pixel representation in two complements
            var wl = this.wl;
            if(image.file.PixelRepresentation == 0x01)
                wl += parseFloat(0x1 << this.images[0].file.HighBit);
            this.gl.uniform1f(shaderProgram.wlUniform, wl);
            this.gl.uniform1f(shaderProgram.wwUniform, this.ww);
            this.gl.uniform1f(shaderProgram.rsUniform, image.rs);
            this.gl.uniform1f(shaderProgram.riUniform, image.ri);
            this.gl.uniform1f(shaderProgram.alphaUniform, image.alpha);
        };
        
        GLPainter.prototype.init_buffers = function() {
            this.squareVertexPositionBuffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.squareVertexPositionBuffer);
            var vertices = [
                -1.0,  -1.0,  0.0,
                 1.0,  -1.0,  0.0,
                 1.0,   1.0,  0.0,
                -1.0,   1.0,  0.0
            ];
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
            this.squareVertexPositionBuffer.itemSize = 3;
            this.squareVertexPositionBuffer.numItems = 4;
         
            // Texture coords
            this.textureCoordBuffer = this.gl.createBuffer();  
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureCoordBuffer);  
            
            var textureCoordinates = [  
                0.0,  0.0,  
                1.0,  0.0,  
                1.0,  1.0,  
                0.0,  1.0
            ];  
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(textureCoordinates),  
                          this.gl.STATIC_DRAW);
            this.textureCoordBuffer.itemSize = 2;
            this.textureCoordBuffer.numItems = 4;
        
            this.vertexIndexBuffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.vertexIndexBuffer);
            var vertexIndices = [
                0, 1, 2, 0, 2, 3    
            ];
            this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(vertexIndices), this.gl.STATIC_DRAW);
            this.vertexIndexBuffer.itemSize = 1;
            this.vertexIndexBuffer.numItems = 6;
        };
        
        GLPainter.prototype.pan_unit = function() {
            return 2.0/this.gl.viewportHeight;
        };

        // GL Painter //////////////////////////
        ///////////////////////////////////////


        ////////////////////////////////////////
        // Color Lookup Manager - CLUT mgr /////

        function ClutManager() { }
        
        ClutManager.r = function(clut_identifier) {
            return cluts[clut_identifier][0];
        };
        
        ClutManager.g = function(clut_identifier) {
            return cluts[clut_identifier][1];
        };
        
        ClutManager.b = function(clut_identifier) {
            return cluts[clut_identifier][2];
        };

        // Color Lookup Manager - CLUT mgr /////
        ///////////////////////////////////////


        ////////////////////////////////////////
        // lib: transfersyntax /////////////////

        // read vr(both little and big endian)
        function read_vr(buffer, offset) {
            return String.fromCharCode(buffer[offset]) + 
                   String.fromCharCode(buffer[offset+1]);
        }
        
        
        // Big endian readers
        function read_number_BE(buffer, offset, length) {
            var n = 0;
            for(var i=offset;i<offset+length;++i) {
                n = n*256 + buffer[i];
            }
            return n;
        }
        
        function read_tag_BE(buffer, offset) {
            var tag = buffer[offset]*256*256*256 + buffer[offset+1]*256*256 +
                      buffer[offset+2]*256 + buffer[offset+3];
            return tag;
        }
        
        // Little endian readers
        function read_number_LE(buffer, offset, length) {
            var it = offset + length - 1;
            var n = 0;
            for(;it>=offset;--it) {
                var tmp = buffer[it];
                n = n*256 + buffer[it];
            }
            return n;
        }
        
        function read_tag_LE(buffer, offset) {
            var tag = buffer[offset+1]*256*256*256 + buffer[offset]*256*256 +
                      buffer[offset+3]*256 + buffer[offset+2];
            return tag;
        }
        
        // Big endian writers
        function write_tag_BE(buffer, offset, tag) {
            buffer[offset] = (tag & 0xff000000) >> 24;
            buffer[offset+1] = (tag & 0x00ff0000) >> 16;
            buffer[offset+2] = (tag & 0x0000ff00) >> 8;
            buffer[offset+3] = (tag & 0x000000ff);
        }
        
        function write_number_BE(buffer, offset, length, number) {
            for(var i=0;i<length;++i) {
                buffer[offset+i] = (number >> (length-i-1)*8) & 0xff;
            }
        }
        
        function write_tag_LE(buffer, offset, tag) {
            buffer[offset+1] = (tag & 0xff000000) >> 24;
            buffer[offset] = (tag & 0x00ff0000) >> 16;
            buffer[offset+3] = (tag & 0x0000ff00) >> 8;
            buffer[offset+2] = (tag & 0x000000ff);
        }
        
        function write_number_LE(buffer, offset, length, number) {
            for(var i=0;i<length;++i) {
                buffer[offset+i] = (number >> i*8) & 0xff;
            }
        }
        
        // Allows to create a 0x representaiton of a tag parameter to allow creation within ng directives (added by Jem @Dercetech)
        function intToHex8(anInt){

            return hexPad(anInt.toString(16), 8);

            function hexPad(number, length) {
                var str = '' + number;
                while (str.length < length) str = '0' + str;
                str = "0x" + str;
                return str;
            }
        }

        function element_reader(tag_reader, number_reader, implicit) {
            this._read_tag = tag_reader;
            this._read_number = number_reader;
            this._implicit = implicit;
        
            // reads a data element and returns the new offset
            this.read_element = function(buffer, offset, element /* out */) {
                var tag = this._read_tag(buffer, offset);
                offset += 4;
                
                var vl;
                var vr;
                if (tag == 0xfffee000 || tag == 0xfffee00d || tag == 0xfffee0dd) {
                    // Item delimiters
                    element.tag = tag;
                    element.vl = this._read_number(buffer, offset, 4);
                    offset += 4;
                    element.vr = "N/A";
                    return offset;
                }
                    
                if(implicit) {
                    vr = "UN";
                    if(tag in dcmdict) {
                        vr = dcmdict[tag][0];
                    } else if(this._read_tag(buffer, offset + 4) == 0xfffee000) { 
                        // Assume SQ if nothing in dict and next tag is item delimiter
                        vr = "SQ";
                    }
                    vl = this._read_number(buffer, offset, 4);
                    offset += 4;
                } else {
                    vr = read_vr(buffer, offset);
                    if(vr == "OB" || vr == "OF" || vr == "SQ" || vr == "OW" || vr == "UN" || vr == "ox") { 
                        offset += 4;
                        vl = this._read_number(buffer, offset, 4);
                        offset += 4;
                    } else {
                        offset += 2;
                        vl = this._read_number(buffer, offset, 2);
                        offset += 2;
                    }
                }
                
                element.tag = tag;
                element.hex = intToHex8(tag);
                element.vr = vr;
                if (vl == 0xffffffff)
                    element.vl = 0;
                else
                    element.vl = vl;
        
                if(element.vr == "SQ") {
                    element.sequence_items = [];
                    var itemstart = new DataElement(implicit);
                    var seq_offset = this.read_element(buffer, offset, itemstart); // Item start
        
                    if(itemstart.vl == 0xffffffff) { // Implicit length
                        var item = new DataElement(implicit);
                        var seq_offset = this.read_element(buffer, seq_offset, item); // Item start
                        while(item.tag != 0xfffee0dd) { // Sequence delimiter
                            if(item.tag != 0xfffee00d) {
                                element.sequence_items.push(item);
                            }
                            var item = new DataElement(implicit);
                            var seq_offset = this.read_element(buffer, seq_offset, item); // Item start
                        }
                        element.vl = seq_offset-offset;
                    } else { // Explicit length, no sequence delimiter(?)
                        while(seq_offset < offset + element.vl) {
                            var item = new DataElement(implicit);
                            seq_offset = this.read_element(buffer, seq_offset, item);
                            element.sequence_items.push(item);
                        }
                    }
                }
        
                element.data = buffer.subarray(offset, offset + element.vl);
                element.implicit = implicit;
                offset += element.vl;
                return offset;
            }
        }
        
        function element_writer(tag_writer, number_writer, implicit) {
            this._write_tag = tag_writer;
            this._write_number = number_writer;
        
            // writes s a data element and returns the new offset
            this.write_element = function(buffer, offset, element /* in */) {
                // Even out offset
                offset += (offset % 2);
                this._write_tag(buffer, offset, element.tag);
                offset += 4;
                if(implicit) {
                    // 4 bytes for length
                    this._write_number(buffer, offset, 4, element.vl);
                    offset += 4;
                } else {
                    // Write vr
                    buffer[offset] = element.vr[0];
                    buffer[offset+1] = element.vr[1];
        
                    this._write_number(buffer, offset + 2, 2, element.vl);
                    offset += 4;
                }
                // Write actual data
                buffer.set(element.data, offset);
                return offset + element.vl;
            }
        }
        
        var tag_readers = {
            "1.2.840.10008.1.2": read_tag_LE,
            "1.2.840.10008.1.2.1": read_tag_LE,
            "1.2.840.10008.1.2.2": read_tag_BE,
            "1.2.840.10008.1.2.4.50": read_tag_LE,
            "1.2.840.10008.1.2.4.51": read_tag_LE,
            "1.2.840.10008.1.2.4.52": read_tag_LE,
            "1.2.840.10008.1.2.4.53": read_tag_LE,
            "1.2.840.10008.1.2.4.54": read_tag_LE,
            "1.2.840.10008.1.2.4.55": read_tag_LE,
            "1.2.840.10008.1.2.4.56": read_tag_LE,
            "1.2.840.10008.1.2.4.57": read_tag_LE,
            "1.2.840.10008.1.2.4.58": read_tag_LE,
            "1.2.840.10008.1.2.4.59": read_tag_LE,
            "1.2.840.10008.1.2.4.60": read_tag_LE,
            "1.2.840.10008.1.2.4.61": read_tag_LE,
            "1.2.840.10008.1.2.4.62": read_tag_LE,
            "1.2.840.10008.1.2.4.63": read_tag_LE,
            "1.2.840.10008.1.2.4.64": read_tag_LE,
            "1.2.840.10008.1.2.4.65": read_tag_LE,
            "1.2.840.10008.1.2.4.66": read_tag_LE,
            "1.2.840.10008.1.2.4.70": read_tag_LE,
            "1.2.840.10008.1.2.4.80": read_tag_LE,
            "1.2.840.10008.1.2.4.81": read_tag_LE,
            "1.2.840.10008.1.2.4.90": read_tag_LE,
            "1.2.840.10008.1.2.4.91": read_tag_LE,
            "1.2.840.10008.1.2.4.92": read_tag_LE,
            "1.2.840.10008.1.2.4.93": read_tag_LE
        };
        
        var tag_writers = {
            "1.2.840.10008.1.2": write_tag_LE,
            "1.2.840.10008.1.2.1": write_tag_LE,
            "1.2.840.10008.1.2.2": write_tag_BE,
            "1.2.840.10008.1.2.4.50": write_tag_LE,
            "1.2.840.10008.1.2.4.51": write_tag_LE,
            "1.2.840.10008.1.2.4.52": write_tag_LE,
            "1.2.840.10008.1.2.4.53": write_tag_LE,
            "1.2.840.10008.1.2.4.54": write_tag_LE,
            "1.2.840.10008.1.2.4.55": write_tag_LE,
            "1.2.840.10008.1.2.4.56": write_tag_LE,
            "1.2.840.10008.1.2.4.57": write_tag_LE,
            "1.2.840.10008.1.2.4.58": write_tag_LE,
            "1.2.840.10008.1.2.4.59": write_tag_LE,
            "1.2.840.10008.1.2.4.60": write_tag_LE,
            "1.2.840.10008.1.2.4.61": write_tag_LE,
            "1.2.840.10008.1.2.4.62": write_tag_LE,
            "1.2.840.10008.1.2.4.63": write_tag_LE,
            "1.2.840.10008.1.2.4.64": write_tag_LE,
            "1.2.840.10008.1.2.4.65": write_tag_LE,
            "1.2.840.10008.1.2.4.66": write_tag_LE,
            "1.2.840.10008.1.2.4.70": write_tag_LE,
            "1.2.840.10008.1.2.4.80": write_tag_LE,
            "1.2.840.10008.1.2.4.81": write_tag_LE,
            "1.2.840.10008.1.2.4.90": write_tag_LE,
            "1.2.840.10008.1.2.4.91": write_tag_LE,
            "1.2.840.10008.1.2.4.92": write_tag_LE,
            "1.2.840.10008.1.2.4.93": write_tag_LE
        };

        var number_readers = {
            "1.2.840.10008.1.2": read_number_LE,
            "1.2.840.10008.1.2.1": read_number_LE,
            "1.2.840.10008.1.2.2": read_number_BE,
            "1.2.840.10008.1.2.4.50": read_number_LE,
            "1.2.840.10008.1.2.4.51": read_number_LE,
            "1.2.840.10008.1.2.4.52": read_number_LE,
            "1.2.840.10008.1.2.4.53": read_number_LE,
            "1.2.840.10008.1.2.4.54": read_number_LE,
            "1.2.840.10008.1.2.4.55": read_number_LE,
            "1.2.840.10008.1.2.4.56": read_number_LE,
            "1.2.840.10008.1.2.4.57": read_number_LE,
            "1.2.840.10008.1.2.4.58": read_number_LE,
            "1.2.840.10008.1.2.4.59": read_number_LE,
            "1.2.840.10008.1.2.4.60": read_number_LE,
            "1.2.840.10008.1.2.4.61": read_number_LE,
            "1.2.840.10008.1.2.4.62": read_number_LE,
            "1.2.840.10008.1.2.4.63": read_number_LE,
            "1.2.840.10008.1.2.4.64": read_number_LE,
            "1.2.840.10008.1.2.4.65": read_number_LE,
            "1.2.840.10008.1.2.4.66": read_number_LE,
            "1.2.840.10008.1.2.4.70": read_number_LE,
            "1.2.840.10008.1.2.4.80": read_number_LE,
            "1.2.840.10008.1.2.4.81": read_number_LE,
            "1.2.840.10008.1.2.4.90": read_number_LE,
            "1.2.840.10008.1.2.4.91": read_number_LE,
            "1.2.840.10008.1.2.4.92": read_number_LE,
            "1.2.840.10008.1.2.4.93": read_number_LE
        };
        
        var number_writers = {
            "1.2.840.10008.1.2": write_number_LE,
            "1.2.840.10008.1.2.1": write_number_LE,
            "1.2.840.10008.1.2.2": write_number_BE,
            "1.2.840.10008.1.2.4.50": write_number_LE,
            "1.2.840.10008.1.2.4.51": write_number_LE,
            "1.2.840.10008.1.2.4.52": write_number_LE,
            "1.2.840.10008.1.2.4.53": write_number_LE,
            "1.2.840.10008.1.2.4.54": write_number_LE,
            "1.2.840.10008.1.2.4.55": write_number_LE,
            "1.2.840.10008.1.2.4.56": write_number_LE,
            "1.2.840.10008.1.2.4.57": write_number_LE,
            "1.2.840.10008.1.2.4.58": write_number_LE,
            "1.2.840.10008.1.2.4.59": write_number_LE,
            "1.2.840.10008.1.2.4.60": write_number_LE,
            "1.2.840.10008.1.2.4.61": write_number_LE,
            "1.2.840.10008.1.2.4.62": write_number_LE,
            "1.2.840.10008.1.2.4.63": write_number_LE,
            "1.2.840.10008.1.2.4.64": write_number_LE,
            "1.2.840.10008.1.2.4.65": write_number_LE,
            "1.2.840.10008.1.2.4.66": write_number_LE,
            "1.2.840.10008.1.2.4.70": write_number_LE,
            "1.2.840.10008.1.2.4.80": write_number_LE,
            "1.2.840.10008.1.2.4.81": write_number_LE,
            "1.2.840.10008.1.2.4.90": write_number_LE,
            "1.2.840.10008.1.2.4.91": write_number_LE,
            "1.2.840.10008.1.2.4.92": write_number_LE,
            "1.2.840.10008.1.2.4.93": write_number_LE
        }
        
        // Element reader factory
        // All transfer syntaxes for encapsulation of encoded pixel data uses Explicit VR Little endian (11_05 A4)
        function get_element_reader(transfersyntaxUID) {
            if(transfersyntaxUID in tag_readers && transfersyntaxUID in number_readers) {
                return new element_reader(tag_readers[transfersyntaxUID],
                                          number_readers[transfersyntaxUID],
                                          is_implicit[transfersyntaxUID])
            }
            return;
        }
        
        function get_element_writer(transfersyntaxUID) {
            return;
        }
        
        var meta_element_reader = get_element_reader("1.2.840.10008.1.2.1");

        // lib: transfersyntax /////////////////
        ///////////////////////////////////////

        ////////////////////////////////////////
        // lib: binutils ///////////////////////

        function buffer_to_string(buffer, len){
            // Check for zeroes?
            var s = ""
            for(var i=0;i<len;++i) {
                if(buffer[i] == 0)
                    break;
                s += String.fromCharCode(buffer[i]);
            }
            return s;
        }
        
        function buffer_to_string_float(buffer, len){
            var vals = buffer_to_string(buffer, len).split("\\").map(parseFloat);
            if(vals.length == 1)
                return vals[0];
            else
                return vals;
        }
        
        function buffer_to_unsigned_le(buffer, len) {
            var i = len-1;
            var n = 0;
            for(;i>=0;--i)
            {
                n = n*256 + buffer[i];
            }
            return n;
        }
        
        function buffer_to_unsigned_be(buffer, len) {
            var i = 0;
            var n = 0;
            for(;i<len;i++)
            {
                n = n*256 + buffer[i];
            }
            return n;
        }
        
        function buffer_to_uint16array_le(buffer, len) {

            return new Uint16Array(buffer.buffer, buffer.byteOffset, len/2);
        }
        
        function buffer_to_uint16array_be(buffer, len) {
            
            for(var i=0; i<len; i+=2) {
                var ra = buffer[i];
                var rb = buffer[i+1];
                buffer[i] = rb;
                buffer[i+1] = ra;
            }
        
            return new Uint16Array(buffer.buffer, buffer.byteOffset, len/2);
        }
        
        function buffer_to_uint8array(buffer, len) {
            return new Uint8Array(buffer.buffer, buffer.byteOffset, len);
        }
        
        function buffer_to_integer_string(buffer, len) {
            return parseInt(buffer_to_string(buffer, len));
        }
        
        var element_to_repr_le = {
            "SH": buffer_to_string,
            "AE": buffer_to_string,
            "AS": buffer_to_string,
            "DS": buffer_to_string,
            "CS": buffer_to_string,
            "UI": buffer_to_string,
            "DA": buffer_to_string,
            "PN": buffer_to_string,
            "TM": buffer_to_string,
            "UT": buffer_to_string,
            "US": buffer_to_unsigned_le,
            "UL": buffer_to_unsigned_le,
            "SS": buffer_to_unsigned_le,
            "IS": buffer_to_integer_string
        };
        
        var element_to_repr_be = {
            "SH": buffer_to_string,
            "AE": buffer_to_string,
            "AS": buffer_to_string,
            "DS": buffer_to_string,
            "CS": buffer_to_string,
            "UI": buffer_to_string,
            "DA": buffer_to_string,
            "PN": buffer_to_string,
            "TM": buffer_to_string,
            "UT": buffer_to_string,
            "US": buffer_to_unsigned_be,
            "UL": buffer_to_unsigned_be,
            "SS": buffer_to_unsigned_be,
            "IS": buffer_to_integer_string
        };
        
        var element_to_value_le = {
            "SH": buffer_to_string,
            "AE": buffer_to_string,
            "AS": buffer_to_string,
            "DS": buffer_to_string_float,
            "CS": buffer_to_string,
            "UI": buffer_to_string,
            "DA": buffer_to_string,
            "PN": buffer_to_string,
            "LO": buffer_to_string,
            "TM": buffer_to_string,
            "UT": buffer_to_string,
            "US": buffer_to_unsigned_le,
            "UL": buffer_to_unsigned_le,
            "SS": buffer_to_unsigned_le,
            "IS": buffer_to_integer_string,
            "OW": buffer_to_uint16array_le,
            "ox": buffer_to_uint16array_le,
            "OB": buffer_to_uint8array
        };
        
        var element_to_value_be = {
            "SH": buffer_to_string,
            "AE": buffer_to_string,
            "AS": buffer_to_string,
            "DS": buffer_to_string_float,
            "CS": buffer_to_string,
            "UI": buffer_to_string,
            "DA": buffer_to_string,
            "PN": buffer_to_string,
            "LO": buffer_to_string,
            "TM": buffer_to_string,
            "UT": buffer_to_string,
            "US": buffer_to_unsigned_be,
            "UL": buffer_to_unsigned_be,
            "SS": buffer_to_unsigned_be,
            "IS": buffer_to_integer_string,
            "OW": buffer_to_uint16array_be,
            "ox": buffer_to_uint16array_be,
            "OB": buffer_to_uint8array
        };

        /* // Probably to delete
        function tag_repr(tag) {
            var t = tag.toString(16).toUpperCase();
            while(t.length < 8)
                t="0"+t;
            t = "(" + t.substr(0,4) + ", " + t.substr(4,4) + ")";
            return t;
        }
        

        function element_repr(elem) {
            // Convert tag to dicom format
            var tag = elem.tag.toString(16).toUpperCase();
            while(tag.length < 8)
                tag="0"+tag;
            tag = "(" + tag.substr(0,4) + ", " + tag.substr(4,4) + ")";
            if(elem.vr in element_to_repr)
            {
                return tag + " - " + element_to_repr[elem.vr](elem.data, elem.vl);
            }
            return tag + " VR: " + elem.vr;
        }
        */
        
        // lib: binutils ///////////////////////
        ///////////////////////////////////////

        ////////////////////////////////////////
        // lib: dcmfile ////////////////////////

        function DataElement(little_endian) {
            this.little_endian = little_endian;
            var _get_value = function(element_to_value) {
                return function() {
                    if(this.vr in element_to_value) {
                        return element_to_value[this.vr](this.data, this.vl);
                    } else {
                        return undefined;
                    }
                };
            };
            this.get_value = _get_value(this.little_endian ? element_to_value_le : element_to_value_be);
        
            var _get_repr = function(element_to_repr) {
                return function() {
                    if(this.vr in element_to_repr) {
                        return element_to_repr[this.vr](this.data, this.vl);
                    } else {
                        return undefined;
                    }
                };
            }
            this.get_repr = _get_repr(this.little_endian ? element_to_repr_le : element_to_repr_be);
        }
        
        function DcmFile() {
            // File Meta Information
            this.meta_elements = {};
            this.data_elements = {};
        }
        
        DcmFile.prototype.get_meta_element = function(tag) {
            return this.meta_elements[tag];
        }
        
        DcmFile.prototype.get_element = function(tag) {
            return this.data_elements[tag];
        }
        
        DcmFile.prototype.get = function(tagname) {
            return this.data_elements[dcmdict[tagname]].get_value();
        }
        
        // Input can be an int, a string attribute or a number in a string (added by Jem @Dercetech)
        DcmFile.prototype.getElement = function(tag){
        
            // Is a string provided?
            if (typeof tag === 'string' || tag instanceof String){
            
                // It can be either an attribute name or an int string
                if(isNaN(tag)){
                    
                    // Maybe is this tag containing a HEX but formated like Chafey's parser handles: x00100040
                    if( (tag[0].toLowerCase()[0] === "x") && (!isNaN(tag.toLowerCase().split("x")[1])) ){
                    
                        tag = Number.parseInt("0" + tag.toLowerCase());
                    }
                    
                    // Maybe is this tag containing a HEX, but formated like (0010,0040) (brackets and/or comma are optional)
                    else if( !isNaN(tag.replace(/[(,)]/g, '')) ){
                        tag = Number.parseInt("0x" + tag.replace(/[(,)]/g, ''));
                    }
                    
                    // Finally, assume this string contains an attribute name (matching one in the embedded dictionary)
                    else tag = dcmdict[tag];
                }
                
                else{
                    
                    // This string contains a tag id
                    tag = Number.parseInt(tag);
                }
            }
        
            return this.data_elements[tag];
        }
        
        // Input can be an int, a string attribute or a number in a string (added by Jem @Dercetech)
        DcmFile.prototype.getElementValue = function(tag){
            
            var element = this.getElement(tag);
            
            try{
                return element.get_value();
            }
            
            catch(e){
                
                console.log('tag ' + tag + ' not found in this DICOM file.');
            }
            
            return null;
        }
        
        DcmFile.prototype.getCTValue = function(col, row) {
            if(col < 0 || col >= this.Columns || row < 0 || row >= this.Rows)
                return undefined;
            var data_idx = (col + row*this.Columns);
            var intensity = this.PixelData[data_idx] * this.RescaleSlope + this.RescaleIntercept;
            return intensity;
        }
        
        DcmFile.prototype.getPatientCoordinate = function(col, row) {
                if (this.imagePosition == undefined || this.imageOrientationColumn == undefined || this.imageOrientationRow == undefined)
                    return undefined;
                return [this.imagePosition[0] + row * this.imageOrientationRow[0] + col * this.imageOrientationColumn[0],
                        this.imagePosition[1] + row * this.imageOrientationRow[1] + col * this.imageOrientationColumn[1],
                        this.imagePosition[2] + row * this.imageOrientationRow[2] + col * this.imageOrientationColumn[2]];
        }        
                
        // lib: dcmfile ////////////////////////
        ///////////////////////////////////////

        ////////////////////////////////////////
        // lib: dicomparser ////////////////////
        
        function DicomParser(buffer) {
            this.buffer = buffer;
        }
        
        DicomParser.prototype.read_number = function(offset, length) {
            // NOTE: Only little endian
            var it = offset+length-1;
            var n = 0;
            for(;it>=offset;--it)
            {
                //var tmp = this.buffer[it];
                n = n*256 + this.buffer[it];
            }
            return n;
        };
        
        DicomParser.prototype.read_string = function(start, len) {
            var s = "";
            var end = start+len;
            for(var i=start;i<end;++i) {
                s += String.fromCharCode(this.buffer[i]);
            }
            return s;
        };
        
        DicomParser.prototype.read_VR = function(offset) {
            return this.read_string(offset, 2);
        };
        
        DicomParser.prototype.read_tag = function(offset) {
            var vl = this.buffer[offset+1]*256*256*256 + this.buffer[offset]*256*256 +
                     this.buffer[offset+3]*256 + this.buffer[offset+2];
            return vl;
        };
        
        DicomParser.prototype.parse_file = function() {
            
            var file = new DcmFile();
            // Look for DICM at pos 128
            var magicword = this.read_string(128, 4);
            
            console.log('must throw exception in case nothing is found');
            
            if(magicword != "DICM"){

                console.log("no magic word found");
                return;
            }
            
            // File Meta Information should always use Explicit VR Little Endian(1.2.840.10008.1.2.1)
            // Parse Meta Information Group Length
            var offset = 132;
            var tag = this.read_tag(offset);
            offset += 4;
        
            var vr = this.read_VR(offset);
            offset += 2;
        
            var vl = this.read_number(offset, 2);
            offset += 2;
        
            var value = this.read_number(offset, vl);
            offset += vl;
            var meta_element_end = offset+value;
        
            // Parse File Meta Information
            while(offset < meta_element_end) {
                var meta_element = new DataElement(true);
                offset = meta_element_reader.read_element(this.buffer, offset, meta_element);
                file.meta_elements[meta_element.tag] = meta_element;
            }
        
            var transfer_syntax = file.get_meta_element(0x00020010).get_value();
            var little_endian = is_little_endian[transfer_syntax];
            // Get reader for transfer syntax
            var element_reader = get_element_reader(transfer_syntax);
            if(element_reader == undefined)
                throw "Unknown TransferSyntaxUID";
        
            // Parse Dicom-Data-Set
            while(offset + 6 < this.buffer.length) {
                var data_element = new DataElement(little_endian);
        
                offset = element_reader.read_element(this.buffer, offset, data_element);
                file.data_elements[data_element.tag] = data_element;
                if(data_element.tag in dcmdict)
                    file[dcmdict[data_element.tag][1]] = data_element.get_value();
            }
        
            if(element_reader._implicit && 'PixelData' in file && file.PixelData == undefined) {
                if(file.BitsStored == 16) {
                    data_element = file.data_elements[dcmdict['PixelData']];
                    data_element.vr = "OW";
                    file[dcmdict[data_element.tag][1]] = data_element.get_value(); 
                } else if(file.BitsStored == 8) {
                    data_element = file.data_elements[dcmdict['PixelData']];
                    data_element.vr = "OB";
                    file[dcmdict[data_element.tag][1]] = data_element.get_value(); 
                }
            }
            return file;
        };
        
        // jsdicom-lib/dicomparser.js //////////
        ///////////////////////////////////////
        
        ////////////////////////////////////////
        // Interface ///////////////////////////
        
        return {
            
            "DicomParser"   : DicomParser,
            
            "GLPainter"     : GLPainter,
            "CanvasPainter" : CanvasPainter,
            
            "ClutManager"   : ClutManager,
            
            "dictionary"    : dcmdict,
        };
        
        // Interface ///////////////////////////
        ///////////////////////////////////////

    }
]);