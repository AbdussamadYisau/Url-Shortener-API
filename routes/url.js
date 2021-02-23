const express = require("express");
const router = express.Router();
const appModel = require("../models/db");
const bodyParser = require("body-parser");
const validUrl = require('valid-url');
const shortId = require('shortid');
const shortid = require("shortid");

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: true }));

// @route POST /api/url/shorten
//  @desc Create short URL
router.post("/shorten", async (req, res) => {
    const { longUrl } = req.body;
    const baseUrl = 'http://localhost:8080';

    if (!validUrl.isUri(baseUrl)) {
        return res.status(401).json('Invalid base URL');
    }

    // Create url code
    const urlCode = shortid.generate();

    // Check long url
    if(validUrl.isUri(longUrl)) {
        try {
            let url = await appModel.findOne({ longUrl });

            if(url) {
                res.json(url);
            } else {
                const shortUrl = `${baseUrl}/${urlCode}`;

                url = new appModel({
                    longUrl,
                    shortUrl,
                    urlCode,
                    date: new Date()
                });

                await url.save();

                res.json(url);
            }
        } catch (err) {
            console.error(err);
            res.status(500).json('Server error');
        }
    } else {
        res.status(401).json('Invalid Long URL');
    }

});

module.exports = router;