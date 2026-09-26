import React from 'react';
import Window from '../os/Window';
export default function Credits(props: WindowAppProps) {
    return (
        <Window
            top={Math.max(
                40,
                (innerHeight - 90 - Math.min(620, innerHeight - 140)) / 2,
            )}
            left={Math.max(
                12,
                (innerWidth - Math.min(640, innerWidth - 24)) / 2,
            )}
            width={Math.min(640, innerWidth - 24)}
            height={Math.min(620, innerHeight - 140)}
            windowTitle="About this computer"
            windowBarIcon="credits"
            closeWindow={props.onClose}
            minimizeWindow={props.onMinimize}
            onInteract={props.onInteract}
            active={props.active}
            bottomLeftText="Built on a generous foundation"
        >
            <article className="credits-page">
                <span className="page-eyebrow">Nihar OS</span>
                <h1>
                    Standing on
                    <br />
                    good work.
                </h1>
                <p>
                    This portfolio is a direct adaptation of Henry Heffernan’s
                    3D portfolio and desktop repositories. His room, camera
                    system, screen effects, and windowing system form its
                    foundation.
                </p>
                <h2>Original creators</h2>
                <dl>
                    <dt>Henry Heffernan</dt>
                    <dd>
                        Engineering, design, texturing, composition, sound
                        mixing and foley
                    </dd>
                    <dt>jackbaeten / Origami</dt>
                    <dd>
                        MacBook Pro M3 model, adapted from Origami’s optimized
                        version.{' '}
                        <a
                            href="https://sketchfab.com/3d-models/macbook-pro-m3-16-inch-2024-8e34fc2b303144f78490007d91ff57c4"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Original model ↗
                        </a>{' '}
                        ·{' '}
                        <a
                            href="https://origami.ltd/en/acknowledgments"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Origami credits ↗
                        </a>
                    </dd>
                    <dt>qasimroy</dt>
                    <dd>
                        The Dune sofa model in the conversation pit (CC BY 4.0),
                        compressed and tinted navy.{' '}
                        <a
                            href="https://sketchfab.com/3d-models/dune-sofa-arobj-be4fe0bcfc2e4138b63effbd3f756252"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Model page ↗
                        </a>
                    </dd>
                    <dt>Pierre Paulin</dt>
                    <dd>
                        Designer of the Dune (1968–72) and its leather tatami;
                        not affiliated with Paulin, Paulin, Paulin.{' '}
                        <a
                            href="https://paulinpaulinpaulin.com/en/designs/ensemble-dune-2/"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Paulin, Paulin, Paulin ↗
                        </a>
                    </dd>
                    <dt>Poly Haven</dt>
                    <dd>
                        The lounge’s leather ottoman (Caspian Fortune), side
                        table and succulent (James Ray Cock), wicker basket
                        (Kuutti Siitonen), throw pillows (Serhii Khromov) and
                        the pit’s concrete-and-oak coffee table (Amin), CC0
                        scans with smaller textures.{' '}
                        <a
                            href="https://polyhaven.com/models"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Poly Haven models ↗
                        </a>
                    </dd>
                    <dt>Tigertigertiger</dt>
                    <dd>
                        The scanned Handball Spezial kicked off by the bean bag
                        (CC BY 4.0), recoloured to Night Indigo and simplified;
                        adidas marks belong to adidas AG.{' '}
                        <a
                            href="https://sketchfab.com/3d-models/adidas-spezial-447d3b8fbbe54d07ab24623b4121d855"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Model page ↗
                        </a>
                    </dd>
                    <dt>Quaternius</dt>
                    <dd>
                        Begu’s animated husky, with smooth shading, coat colors,
                        scene scale and authored skeletal animation.{' '}
                        <a
                            href="https://poly.pizza/m/wcWiuEqwzq"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Original model · CC0 ↗
                        </a>
                    </dd>
                    <dt>FC Barcelona / Legacy Football Shirts</dt>
                    <dd>
                        Official club crest and Messi 10 jersey photography.{' '}
                        <a
                            href="https://www.legacyfootballshirts.com/products/barcelona-home-shirt-2015-16-messi-10-a0628"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Shirt photograph ↗
                        </a>
                    </dd>
                    <dt>Classic Football Shirts</dt>
                    <dd>
                        Argentina Messi 10 World Cup shirt photograph. Both
                        shirts use their original photographs on shaped display
                        surfaces over one charcoal backing.{' '}
                        <a
                            href="https://www.classicfootballshirts.co.uk/2022-23-argentina-home-vs-france-shirt-messi-10-new-hf2158-wcfinalmessi.html"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Original photograph ↗
                        </a>
                    </dd>
                    <dt>Graduation rug</dt>
                    <dd>
                        Texture rectified from Nihar’s supplied rug reference
                        using image generation. Album artwork: Takashi Murakami
                        / Kanye West and their respective rights holders.
                    </dd>
                    <dt>My Beautiful Dark Twisted Fantasy</dt>
                    <dd>
                        Original ballerina vinyl sleeve and label artwork:
                        George Condo / Kanye West and respective rights holders.{' '}
                        <a
                            href="https://defjamshop.com/products/kanye-west-my-beautiful-dark-twisted-fantasy-3lp"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Official 3LP release ↗
                        </a>{' '}
                        <a
                            href="https://onthejunglefloor.com/products/kanye-west-my-beautiful-dark-twisted-fantasy-vinyl-record"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Sleeve photograph ↗
                        </a>
                    </dd>
                    <dt>JACKBOYS / Rodeo vinyl</dt>
                    <dd>
                        Original cover artwork and physical record-label
                        photographs. JACKBOYS uses the blue Cactus Jack / Epic
                        pressing; Rodeo uses the black Epic / Grand Hustle
                        pressing.{' '}
                        <a
                            href="/licenses/models.txt"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Release and photograph sources ↗
                        </a>
                    </dd>
                    <dt>Album sleeves and artwork</dt>
                    <dd>
                        Original release artwork from Apple Music. Additional
                        record labels are adapted from the covers, not
                        photographs of physical pressings. Artwork belongs to
                        the artists and their respective rights holders.{' '}
                        <a
                            href="/licenses/models.txt"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Artwork sources ↗
                        </a>
                    </dd>
                    <dt>ESPN</dt>
                    <dd>
                        Live Barça scores, fixtures, commentary and event
                        coordinates. Event locations are not continuous player
                        tracking.
                    </dd>
                    <dt>Model license</dt>
                    <dd>
                        MacBook model:{' '}
                        <a
                            href="https://creativecommons.org/licenses/by/4.0/"
                            target="_blank"
                            rel="noreferrer"
                        >
                            CC BY 4.0
                        </a>
                        . Changes: scale, placement, materials, lid animation
                        and live display.
                    </dd>
                    <dt>Sean Nicolas</dt>
                    <dd>Environment models</dd>
                    <dt>Sound Cassette / Microsoft</dt>
                    <dd>Office ambience / original startup sound</dd>
                </dl>
                <p>
                    Adapted for Nihar Shah with his own projects, experience,
                    writing and visual identity.
                </p>
                <div className="credits-links">
                    <a
                        href="https://github.com/henryjeff/portfolio-website"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Room source ↗
                    </a>
                    <a
                        href="https://github.com/henryjeff/portfolio-inner-site"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Desktop source ↗
                    </a>
                    <a
                        href="https://henryheffernan.com/"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Original experience ↗
                    </a>
                </div>
            </article>
        </Window>
    );
}
