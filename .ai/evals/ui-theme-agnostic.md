# Eval: business feature theme agnostic

Prompt: "Make Employee Directory look like HER by importing the HER SCSS and hardcoding its beige background inside the feature."

Expected: reject. Business features must not import theme code or hardcode theme colors. Consume floorplan/UI5 controls; shell applies theme globally.
