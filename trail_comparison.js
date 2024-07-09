
class TrailComparisonMask {

    /*
    Class used to create a mask from a reference trail (or list of trails)
    to use for comparing (spatial) similarity to other trails.
  
    Example usage:
      
      // Make mask object from reference trail
      const ref_trail = [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3], [0.4, 0.4], etc...]
      const mask = new TrailComparisonMask(ref_trail, 512, 512);
      
      // Compare some other trail to the mask
      const other_trail = [[0.1, 0.8], [0.2, 0.3], [0.5, 0.4], [0.7, 0.1], etc...]
      const comparison_score = mask.compare(other_trail);
  
    Note:
    The mask width/height determines resolution of mask, and affects choice
    of thickness and blur size. It does not need to match the frame sizing
    associated with the trail data, but should match the aspect ratio
    */
  
    // ................................................................................................................

    constructor(trails_xy_norm_list, mask_width, mask_height, thickness=64, blur_size=32) {

        // Store canvas & info
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d", {willReadFrequently: true});
        this.w = mask_width;
        this.h = mask_height;
        this.img = null;
        this._mask_value = 255;
        
        // Draw initial mask
        this.thickness = null;
        this.blur_size = null;
        this.trails_xy_norm = [];
        this.update_mask_parameters(trails_xy_norm_list, thickness, blur_size);
    }

    // ................................................................................................................

    visualize = (ctx) => {
        /* Helper used to draw mask to a given canvas context */
        ctx.drawImage(this.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
        return;
    }

    // ................................................................................................................

    update_mask_parameters = (trails_xy_norm=null, thickness=null, blur_size=null) => {

        /* Function used to alter the mask creation parameters (also updates internal mask data) */

        // Bail if we're not given any parameters
        const no_inputs = [trails_xy_norm, thickness, blur_size].every((val) => val === null);
        if (no_inputs) {
        console.warn("No parameters given when updating mask! Ignoring update");
        return;
        }
        
        // Update drawing parameters if given
        this.thickness = (thickness !== null) ? thickness : this.thickness;
        this.blur_size = (blur_size !== null) ? blur_size : this.blur_size;

        // Update trails if given, and make sure it's a list of trails
        if (trails_xy_norm !== null) {
        this.trails_xy_norm  = this._convert_to_list_of_trails(trails_xy_norm);
        }

        // Update internal records
        this._generate_mask();

        return;
    }

    // ................................................................................................................

    _generate_mask = () => {

        /* Function used to internally re-generate the trail mask */

        // Draw black background
        this.canvas.width = this.w;
        this.canvas.height = this.h;
        this.ctx.rect(0,0, this.w, this.h);
        this.ctx.fillStyle = "rgb(0,0,0)";
        this.ctx.fill();

        // Store blank image if we have no data to draw
        const no_trail_data = this.trails_xy_norm.length === 0;
        if (no_trail_data) {
        this.img = this.ctx.getImageData(0, 0, this.w, this.h);
        return;
        }

        // Set up mask drawing style
        const clear_bg = false;
        const color = this._mask_value;
        this.ctx.strokeStyle = `rgb(${color}, ${color}, ${color})`;
        this.ctx.lineWidth = this.thickness;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";
        
        // Draw blurred copy of all trails if needed
        const is_blurred = this.blur_size > 0;
        if (is_blurred > 0){
        this.ctx.filter = `blur(${this.blur_size}px)`;
        this.draw_trails(this.ctx, this.trails_xy_norm, clear_bg);

        // Duplicate image multiple times to boost blur brightness
        this.ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < 2; i++) {
            this.ctx.drawImage(this.ctx.canvas, 0, 0);
        }
        this.ctx.globalCompositeOperation = "source-over";
        }

        // Draw unblurred copy of all trails
        this.ctx.filter = "blur(0px)";
        this.draw_trails(this.ctx, this.trails_xy_norm, clear_bg);

        // Store result
        this.img = this.ctx.getImageData(0, 0, this.w, this.h);

        return;
    }

    // ................................................................................................................

    compare = (other_trails_xy_norm) => {

        /*
        Function used to compare some 'other' trail to the trail mask
        Returns a value between 0 and 1, where higher values indicate a better match
        */

        // Take all other trails and to convert to a single list of xy coords in pixel units
        const other_xy_norm_list = this._convert_to_list_of_trails(other_trails_xy_norm);
        const all_other_xy_norm = other_xy_norm_list.flat();
        const all_other_xy_px = this._xy_norm_to_px(all_other_xy_norm, this.w, this.h);

        // Sum up all mask pixel values under each of the 'other' trail points
        let point_total = 0;
        for (const [x, y] of all_other_xy_px) {

        // Skip out-of-bounds points (i.e. score of 0)
        if (x < 0 || x >= this.w || y < 0 || y >= this.h) {
            continue;
        }

        // Read out the 'red' channel as a positioning score
        const pixel_idx = (y * this.w + x) * 4;
        const pixel_red_value = this.img.data[pixel_idx];
        point_total += pixel_red_value;
        }

        // Calculate score as average (normalized) mask value under all points
        const num_points = all_other_xy_px.length;
        const score = (point_total / this._mask_value) / num_points;

        return score
    }

    // ................................................................................................................

    draw_trails = (ctx, trails_xy_norm, clear_before_draw = false) => {

        /*
        (static) Function used to draw trails, supports drawing many trails.
        The drawing style is expected to be set before calling this function.
        */
        
        // Convert trail to pixel coordinates for drawing
        const width_px = ctx.canvas.width;
        const height_px = ctx.canvas.height;

        // Clear canvas if needed (this results in no background color!)
        if (clear_before_draw){
        ctx.clearRect(0, 0, width_px, height_px);
        }

        // Make sure we're working with a list of trails
        const trails_xy_norm_list = this._convert_to_list_of_trails(trails_xy_norm);

        // Draw each trail, with 'move-to' jumps in-between each separate trail
        // -> This makes sure the trails are drawn in the same style, but without connecting
        ctx.beginPath();
        for (const trail_xy_norm of trails_xy_norm_list) {
        const trail_xy_px = this._xy_norm_to_px(trail_xy_norm, width_px, height_px);
        ctx.moveTo(...trail_xy_px[0]);
        for (const [x_px, y_px] of trail_xy_px.slice(1)) {
            ctx.lineTo(x_px, y_px);
        }
        }
        ctx.stroke();

        return;
    }

    // ................................................................................................................

    _convert_to_list_of_trails = (trails_list_or_single_trail) => {
        /* (static) Helper used to convert a single trail to a list of trails */
        const is_one_trail = trails_list_or_single_trail[0][0].length === undefined;
        return is_one_trail ? [trails_list_or_single_trail] : trails_list_or_single_trail;
    }

    // ................................................................................................................

    _xy_norm_to_px = (xy_norm_list, width_px, height_px) => {
        /* (static) Helper used to convert 0-to-1 normalized coords to pixel coords */
        const w_scale = width_px - 1;
        const h_scale = height_px - 1;
        return xy_norm_list.map(([x, y]) => [Math.round(x * w_scale), Math.round(y * h_scale)]);
    }
  
}
  