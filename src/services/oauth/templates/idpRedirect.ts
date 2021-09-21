export const idpRedirect = `<html>
    <head>
        <title>Opening provider tab</title>
        <link rel="icon" type="image/png" href="https://cloud.bastionzero.com/assets/icons/favicon_light.png">
        <link rel="stylesheet" href="https://code.cdn.mozilla.net/fonts/fira.css">
        <style>
            .center-div {
                text-align: center;
                margin: 0;
                position: absolute;
                top: 50%;
                left: 50%;
                -ms-transform: translate(-50%, -50%);
                transform: translate(-50%, -50%);
            }
            .text {
                font-family: Fira Sans;
                color: white;
            }
        </style>
    </head>
    <body style="background-color:#242424;">
        <div class="center-div">
            <img src="https://cloud.bastionzero.com/assets/icons/Wordmark-Horizontal.png" height="28px">
            <br>
            <p class="text">Opening a new identity provider tab, please authenticate there.</p>
        </div>
    </body>
</html>`;