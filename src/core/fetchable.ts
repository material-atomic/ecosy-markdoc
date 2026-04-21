import { Http } from "@ecosy/core";
import { Injectable } from "../classable/injectable";

export interface FetchableLike {
  http: Http;
}

export class Fetchable extends Injectable({
  http: Http
}) {
  onInit(): void | Promise<void> {
    // Register default configuration (extract result.data)
    this.http.on("transform", (res: Record<string, unknown>) => res.data);
  }
}
