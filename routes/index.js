const express = require("express");
const router = express.Router();
const appModel = require("../models/db");
const bodyParser = require("body-parser");

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));

//  @route GET /:code
//  @desc Redirect to long/original URL
router.get("/:code", async (req, res) => {
    try {
        const url = await appModel.findOne({ urlCode: req.params.code });

        if (url) {
            return res.redirect(url.longUrl);
        } else {
            return res.status(404).json('No url found');
        }
    } catch (err) {
        console.error(err);
        res.status(500).json('Server error');
    }
});

module.exports = router;