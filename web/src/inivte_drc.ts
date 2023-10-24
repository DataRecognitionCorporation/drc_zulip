// import * as stream_data from "./stream_data";

import {
  get_invite_stream_data,
  get_all_invite_stream_data
} from "./stream_data"

import type {
  StreamSubscription,
} from "./sub_store";

import type {
  InviteStreamData,
} from "./stream_data";

type InviteStreamDataWithCheckboxes = {
  name: string;
  stream_id: number;
  invite_only: boolean;
  is_web_public: boolean;
  default_stream: boolean;
  is_checked: boolean;
};

export class StreamList {

  all_streams: InviteStreamDataWithCheckboxes[];

  constructor() {
    let streams: InviteStreamDataWithCheckboxes[] = (get_all_invite_stream_data() as InviteStreamDataWithCheckboxes[]);
    this.all_streams = [];

    for(let stream of streams){
      if(stream.default_stream){
        stream.is_checked = true;
        this.all_streams.push(stream);
      } else {
        stream.is_checked = false;
        this.all_streams.push(stream);
      }
    }
  }

  switch_checked(stream_id: number){
    for(const stream of this.all_streams){
      if(stream.stream_id == stream_id){
        if(stream.is_checked){
          stream.is_checked = false;
        } else {
          stream.is_checked = true;
        }
        return
      }
    }
  }

  uncheck_all() {
    for(const stream of this.all_streams){
      stream.is_checked = false;
    }
  }

  check_all() {
    for(const stream of this.all_streams){
      stream.is_checked = true;
    }
  }

  get_streams(): InviteStreamDataWithCheckboxes[] {
    return this.all_streams;
  }

  get_streams_filtered(filter: string){
    let temp_streams: InviteStreamDataWithCheckboxes[] = [];
    const filter_text_lower = filter.toLowerCase();

    for (const stream of this.all_streams) {
      const stream_name_lower = stream.name.toLowerCase();
      if (stream_name_lower.includes(filter_text_lower)) {
        temp_streams.push(stream);
      }
    }
    return temp_streams;
  }
}